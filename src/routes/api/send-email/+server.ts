import type { RequestHandler } from '@sveltejs/kit';
import { json, text } from '@sveltejs/kit';
import formData from 'form-data';
import Mailgun from 'mailgun.js';

import dotenv from 'dotenv';

dotenv.config();

const mailgun = new Mailgun(formData);
const mg = mailgun.client({ username: 'api', key: process.env.MAILGUN_API_KEY});

const domain = process.env.MAILGUN_DOMAIN || 'domain-here';
console.log(`mailgun domain: `, domain);


export const POST: RequestHandler = async ({request}) => {

    const { name, email, message } = await request.json();
    console.log("Received request:", name);

    // Basic validation
    if (!name || name.length < 3) {
        return json ({
            status: 400,
            body: { error: 'Name is required and should be at least 3 characters long.' }
        });
    }

    if (!email || !email.includes('@')) {
        return json ({
            status: 400,
            body: { error: 'A valid email is required.' }
        });
    }

    if (!message || message.length < 10) {
        return json ({
            status: 400,
            body: { error: 'Message is required and should be at least 10 characters long.' }
        });
    }

    const data = {
        from: email,
        to: 'info@rsmc.tech',
        subject: `ContactForm: New message from ${name}`,
        text: message
    };

    try {
        const msg = await mg.messages.create(domain, data)
        console.log(`Mailgun response message: `, msg);

        return json ({
            status: 200,
            body: { message: 'Email sent successfully' }
        });
    } catch (error) {
        console.error("Mailgun Error:", error);
        return json ({
            status: 500,
            body: { error: 'Failed to send email' }
        });
    }
}
