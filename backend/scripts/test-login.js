require('dotenv').config();
const mongoose = require('mongoose');
const authService = require('../services/auth/authService');
require('../controllers/authController'); // To register strategies

async function test() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected");
    const result = await authService.login("EMAIL", { 
      email: process.env.SUPER_ADMIN_EMAIL, 
      password: process.env.SUPER_ADMIN_PASSWORD 
    }, { ipAddress: '127.0.0.1' });
    console.log("Login success:", !!result.token);
  } catch(e) {
    console.error("Login failed:", e);
  } finally {
    mongoose.disconnect();
  }
}
test();
