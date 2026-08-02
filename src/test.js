const user = { id: 1, name: 'Alice' };
const { name: userName, sns = 'aNone' } = user;

console.log(userName); // Output: Alice
console.log(sns); // Output: None
