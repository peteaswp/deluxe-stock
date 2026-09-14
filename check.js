/* System check - prints ASCII only so it is readable on any Windows console */
const fs = require('fs'), path = require('path'), os = require('os');
const R = s => path.join(__dirname, s);
const EXT = (process.platform === 'win32') ? '.bat' : '.command';   /* Windows vs Mac launcher */
const line = '='.repeat(58);
console.log('');
console.log(line);
console.log('   FINRA STOCK SERVER  -  SYSTEM CHECK');
console.log(line);
console.log('');
console.log(' [OK] Node.js ' + process.version);

let ok = true;
function row(good, label, hint) {
  console.log(' ' + (good ? '[OK]' : '[!!]') + ' ' + label + (good ? '' : ('   ->  ' + hint)));
  if (!good) ok = false;
}
row(fs.existsSync(R('server.js')), 'program files', 'files missing - ask Claude to send them again');

let days = 0;
try { days = fs.readdirSync(R('data/docs/ledger')).length } catch (e) {}
row(days > 0, 'sales data  (' + days + ' days loaded)', 'run:  node import.js');

const hasUser = fs.existsSync(R('data/users.json'));
row(hasUser, 'user accounts', 'run  2-ADD-USER' + EXT + '  to create the first manager');

console.log('');
console.log(line);
if (!hasUser)      console.log('  NEXT STEP:  close this window, then run  2-ADD-USER' + EXT);
else if (ok)       console.log('  ALL GOOD.   NEXT STEP:  run  3-START' + EXT);
console.log(line);
console.log('');
console.log(' Web address after the server is started:');
console.log('   this PC       ->  http://localhost:8080');
const nets = os.networkInterfaces(), ips = [];
Object.values(nets).forEach(a => a.forEach(x => { if (x.family === 'IPv4' && !x.internal) ips.push(x.address) }));
if (ips.length) ips.forEach(ip => console.log('   factory LAN   ->  http://' + ip + ':8080'));
else console.log('   factory LAN   ->  (no network detected)');
console.log('');
