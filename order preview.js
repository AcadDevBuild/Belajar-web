const postCount = p.postCounts[dur]; // 1, 1, 7, or 30
const pricePerPost = p.prices[dur];
const subtotal = pricePerPost * postCount * qty;
const discount = Math.floor(subtotal * tier.discount/100);
const finalTotal = subtotal - discount;