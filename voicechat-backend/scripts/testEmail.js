import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

console.log('User:', GMAIL_USER);
console.log('Pass:', GMAIL_APP_PASSWORD ? 'set (len ' + GMAIL_APP_PASSWORD.length + ')' : 'not set');

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
    },
});

async function run() {
    console.log('Sending test email to support@datacatalyst.in...');
    const info = await transporter.sendMail({
        from: `"Voclara Test" <${GMAIL_USER}>`,
        to: 'support@datacatalyst.in',
        subject: 'Test Email from script',
        text: 'This is a test email to verify smtp credentials.',
    });
    console.log('Sent successfully!', info);
}

run().catch(console.error);
