import mongoose from 'mongoose';

const SupportTicketSchema = new mongoose.Schema({
  name: String,
  email: String,
  subject: String,
  message: String,
  createdAt: { type: Date, default: Date.now }
});

const SupportTicket = mongoose.model('SupportTicket', SupportTicketSchema);

async function run() {
  await mongoose.connect('mongodb://localhost:27017/voicechat');
  console.log('Connected to DB');
  const tickets = await SupportTicket.find().sort({ createdAt: -1 }).limit(5);
  console.log('Latest Tickets:', JSON.stringify(tickets, null, 2));
  await mongoose.disconnect();
}

run().catch(console.error);
