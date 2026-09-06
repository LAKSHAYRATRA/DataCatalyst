import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import Vendor from '../src/models/Vendor.js';
import User from '../src/models/User.js';
import { suspendVendorAdmin, reactivateVendorAdmin, deleteVendorAdmin } from '../src/controllers/vendorController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '..', '.env') });
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/voicechat';

async function runTest() {
  let testVendor = null;
  let testUser1 = null;
  let testUser2 = null;

  try {
    await mongoose.connect(MONGO_URI);
    console.log(' Connected to MongoDB');

    // 1. Create a test vendor
    testVendor = await Vendor.create({
      name: 'Automated Test Vendor',
      vendorCode: 'TESTSUSP01',
      email: 'test_susp_vendor@datacatalyst.com',
      contactPerson: 'QA Tester',
      phone: '+919999999999',
      status: 'active',
      passwordHash: 'hashed_password_123',
      defaultPayrate: 200
    });
    console.log(` Created test vendor: ${testVendor.name} (${testVendor._id})`);

    // 2. Create 2 test users linked to this vendor
    testUser1 = await User.create({
      username: 'test_worker_1_' + Date.now(),
      email: 'test_worker_1_' + Date.now() + '@test.com',
      passwordHash: 'user_password_hash_1',
      speaker_id: 'SPK_TEST_1_' + Date.now(),
      vendorId: testVendor._id,
      vendorCode: testVendor.vendorCode,
      perCallPayrate: 15,
      hourlyPhrasePayrate: 250
    });

    testUser2 = await User.create({
      username: 'test_worker_2_' + Date.now(),
      email: 'test_worker_2_' + Date.now() + '@test.com',
      passwordHash: 'user_password_hash_2',
      speaker_id: 'SPK_TEST_2_' + Date.now(),
      vendorId: testVendor._id,
      vendorCode: testVendor.vendorCode,
      perCallPayrate: 20,
      hourlyPhrasePayrate: 300
    });
    console.log(` Created 2 linked test contributors`);

    // 3. Test Suspend Vendor
    console.log('\n--- Testing suspendVendorAdmin ---');
    let suspendResult = null;
    let suspendStatusCode = 200;
    const mockReqSuspend = {
      params: { id: testVendor._id.toString() }
    };
    const mockResSuspend = {
      status(code) {
        suspendStatusCode = code;
        return this;
      },
      json(data) {
        suspendResult = data;
        return this;
      }
    };

    await suspendVendorAdmin(mockReqSuspend, mockResSuspend);

    console.log(`Response status: ${suspendStatusCode}`);
    console.log(`Response payload:`, suspendResult);

    if (suspendStatusCode !== 200 || !suspendResult.ok) {
      throw new Error(`Suspend failed: ${JSON.stringify(suspendResult)}`);
    }

    if (suspendResult.releasedWorkersCount !== 2) {
      throw new Error(`Expected 2 released workers, got ${suspendResult.releasedWorkersCount}`);
    }

    // Verify vendor in DB
    const updatedVendor = await Vendor.findById(testVendor._id);
    if (updatedVendor.status !== 'suspended') {
      throw new Error(`Expected vendor status to be 'suspended', found: ${updatedVendor.status}`);
    }
    console.log(` Verified vendor status in DB is "suspended"`);

    // Verify users in DB turned normal
    const updatedUsers = await User.find({ _id: { $in: [testUser1._id, testUser2._id] } });
    for (const u of updatedUsers) {
      if (u.vendorId !== null) throw new Error(`User ${u.username} vendorId is not null: ${u.vendorId}`);
      if (u.vendorCode !== null) throw new Error(`User ${u.username} vendorCode is not null: ${u.vendorCode}`);
      if (u.perCallPayrate !== 0) throw new Error(`User ${u.username} perCallPayrate is not 0: ${u.perCallPayrate}`);
      if (u.hourlyPhrasePayrate !== 0) throw new Error(`User ${u.username} hourlyPhrasePayrate is not 0: ${u.hourlyPhrasePayrate}`);
      if (u.previousVendorId?.toString() !== testVendor._id.toString()) {
        throw new Error(`User ${u.username} previousVendorId mismatch: ${u.previousVendorId}`);
      }
      if (u.previousVendorCode !== 'TESTSUSP01') {
        throw new Error(`User ${u.username} previousVendorCode mismatch: ${u.previousVendorCode}`);
      }
      console.log(` Verified user ${u.username} successfully turned normal with null vendorId & preserved audit trail.`);
    }

    // 4. Test Reactivate Vendor
    console.log('\n--- Testing reactivateVendorAdmin ---');
    let reactivateResult = null;
    let reactivateStatusCode = 200;
    const mockReqReactivate = {
      params: { id: testVendor._id.toString() }
    };
    const mockResReactivate = {
      status(code) {
        reactivateStatusCode = code;
        return this;
      },
      json(data) {
        reactivateResult = data;
        return this;
      }
    };

    await reactivateVendorAdmin(mockReqReactivate, mockResReactivate);

    console.log(`Response status: ${reactivateStatusCode}`);
    console.log(`Response payload:`, reactivateResult);

    if (reactivateStatusCode !== 200 || !reactivateResult.ok) {
      throw new Error(`Reactivate failed: ${JSON.stringify(reactivateResult)}`);
    }

    const reactivatedVendor = await Vendor.findById(testVendor._id);
    if (reactivatedVendor.status !== 'active') {
      throw new Error(`Expected vendor status to be 'active', found: ${reactivatedVendor.status}`);
    }
    console.log(` Verified vendor status in DB is now "active"`);

    // 5. Test Delete Vendor with Linked Users
    console.log('\n--- Testing deleteVendorAdmin with linked contributors ---');
    // Re-link users to test vendor
    await User.updateMany(
      { _id: { $in: [testUser1._id, testUser2._id] } },
      { $set: { vendorId: testVendor._id, vendorCode: testVendor.vendorCode, perCallPayrate: 15 } }
    );
    const reLinkedCount = await User.countDocuments({ vendorId: testVendor._id });
    console.log(` Re-linked ${reLinkedCount} users to vendor before delete`);

    let deleteResult = null;
    let deleteStatusCode = 200;
    const mockReqDelete = {
      params: { id: testVendor._id.toString() }
    };
    const mockResDelete = {
      status(code) {
        deleteStatusCode = code;
        return this;
      },
      json(data) {
        deleteResult = data;
        return this;
      }
    };

    await deleteVendorAdmin(mockReqDelete, mockResDelete);

    console.log(`Response status: ${deleteStatusCode}`);
    console.log(`Response payload:`, deleteResult);

    if (deleteStatusCode !== 200 || !deleteResult.ok) {
      throw new Error(`Delete failed: ${JSON.stringify(deleteResult)}`);
    }

    if (deleteResult.releasedWorkersCount !== 2) {
      throw new Error(`Expected 2 released workers upon delete, got ${deleteResult.releasedWorkersCount}`);
    }

    const deletedVendorCheck = await Vendor.findById(testVendor._id);
    if (deletedVendorCheck !== null) {
      throw new Error(`Expected vendor to be completely deleted from DB, but still found: ${JSON.stringify(deletedVendorCheck)}`);
    }
    console.log(` Verified vendor is completely deleted from DB (null)`);

    const usersAfterDelete = await User.find({ _id: { $in: [testUser1._id, testUser2._id] } });
    for (const u of usersAfterDelete) {
      if (u.vendorId !== null) throw new Error(`User ${u.username} vendorId is not null after delete: ${u.vendorId}`);
      if (u.vendorCode !== null) throw new Error(`User ${u.username} vendorCode is not null after delete: ${u.vendorCode}`);
      if (u.perCallPayrate !== 0) throw new Error(`User ${u.username} perCallPayrate is not 0 after delete: ${u.perCallPayrate}`);
      if (u.previousVendorId?.toString() !== testVendor._id.toString()) {
        throw new Error(`User ${u.username} previousVendorId mismatch after delete: ${u.previousVendorId}`);
      }
      console.log(` Verified user ${u.username} turned normal upon vendor deletion`);
    }

    console.log('\n ALL TESTS PASSED SUCCESSFULLY! ');
  } catch (err) {
    console.error(' TEST FAILED:', err);
    process.exitCode = 1;
  } finally {
    // Cleanup
    if (testVendor) await Vendor.findByIdAndDelete(testVendor._id);
    if (testUser1) await User.findByIdAndDelete(testUser1._id);
    if (testUser2) await User.findByIdAndDelete(testUser2._id);
    console.log(' Cleaned up test database records.');
    await mongoose.disconnect();
  }
}

runTest();
