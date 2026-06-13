const fs = require('fs');
fs.mkdirSync('public/sounds', { recursive: true });
['kitchen.mp3', 'takeaway.mp3', 'delivery.mp3', 'settle.mp3'].forEach(f => {
  fs.copyFileSync('public/beep.mp3', 'public/sounds/' + f);
});
console.log('Done copying sounds!');
