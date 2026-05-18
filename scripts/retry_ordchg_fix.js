const axios = require('axios');
const API_URL = 'http://localhost:5001';
const API_PIN = '3311'; // Assuming default, or read from env

async function testFix() {
    try {
        console.log("Triggering ORDCHG for Order #85 (Buyer #34)...");
        const response = await axios.post(`${API_URL}/api/orders/accept-modifications`, {
            orderId: 85,
            buyerId: 34
        }, {
            headers: {
                'x-api-pin': API_PIN,
                'x-entite-id': '34',
                'Content-Type': 'application/json'
            }
        });
        console.log("✅ Success:", response.data);
    } catch (error) {
        console.error("❌ Failed:", error.response ? error.response.data : error.message);
    }
}

testFix();
