import type { RequestHandler } from '@sveltejs/kit';
import mailgun from 'mailgun.js';

const mg = mailgun({ apiKey: process.env.MAILGUN_API_KEY as string, domain: process.env.MAILGUN_DOMAIN as string });

export const post: RequestHandler = async (request) => {
    console.log("Received request:", request.body); // Moved this line to the top of the post function

    const { name, email, message } = request.body as { name: string; email: string; message: string };

    // Basic validation
    if (!name || name.length < 3) {
        return {
            status: 400,
            body: { error: 'Name is required and should be at least 3 characters long.' }
        };
    }

    if (!email || !email.includes('@')) {
        return {
            status: 400,
            body: { error: 'A valid email is required.' }
        };
    }

    if (!message || message.length < 10) {
        return {
            status: 400,
            body: { error: 'Message is required and should be at least 10 characters long.' }
        };
    }

    const data = {
        from: email,
        to: 'info@rsmc.tech',
        subject: `ContactForm: New message from ${name}`,
        text: message
    };

    try {
        await mg.messages().send(data);
        return {
            status: 200,
            body: { message: 'Email sent successfully' }
        };
    } catch (error) {
        console.error("Mailgun Error:", error);
        return {
            status: 500,
            body: { error: 'Failed to send email' }
        };
    }
}
