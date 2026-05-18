const { generateOrderResponseEANCOM } = require('./generateOrderResponseEANCOM.js');

const res = generateOrderResponseEANCOM({
  status: 'modified',
  comment: "Le prix a été négocié avec l'acheteur",
  buyerGln: '123',
  supplierGln: '456',
  articles: [
    { gtin: '1234', qty: 10, price: 10, confirmedQty: 10, confirmedPrice: 10, comment: "L'article est bon" }
  ]
});

console.log(res);
