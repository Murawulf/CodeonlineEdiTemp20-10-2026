const { generateOrderResponseEANCOM } = require('./generateOrderResponseEANCOM');

const testData = {
    responseNumber: "RSP123456",
    originalOrderNumber: "CMD-TEST-001",
    originalOrderDate: "2023-10-27T10:00:00.000Z",
    requestedDeliveryDate: "2023-11-01",
    confirmedDeliveryDate: "2023-11-02",
    status: "modified",
    buyerGln: "1111111111111",
    supplierGln: "2222222222222",
    currency: "TND",
    comment: "Delivery delayed by 1 day",
    articles: [
        { gtin: "1234567890123", qty: 10, confirmedQty: 8, price: 10.00, confirmedPrice: 10.00, comment: "Out of stock partial" },
        { gtin: "9876543210987", qty: 5, confirmedQty: 5, price: 20.00, confirmedPrice: 19.50, comment: "Price adjustment" }
    ]
};

try {
    const ediContent = generateOrderResponseEANCOM(testData);
    console.log("✅ ORDRSP Generation Successful");
    console.log("--- START CONTENT ---");
    console.log(ediContent);
    console.log("--- END CONTENT ---");
} catch (err) {
    console.error("❌ ORDRSP Generation Failed:", err);
}
