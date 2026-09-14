/* Create a user:  run  2-ADD-USER.bat
   English only on purpose - Thai text does not display correctly
   in the Windows console on most machines.                        */
const auth = require('./auth'), { ROLES } = require('./roles'), rl = require('readline');
const i = rl.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => i.question(q, a => r(a.trim())));
const EXT = (process.platform === 'win32') ? '.bat' : '.command';

(async () => {
  console.log('');
  console.log('============================================================');
  console.log('   FINRA STOCK SERVER  -  ADD A USER');
  console.log('============================================================');
  console.log('');
  console.log(' Roles you can choose:');
  console.log('');
  Object.keys(ROLES).forEach(k => {
    console.log('   ' + k.padEnd(16) + '= ' + ROLES[k].nameEn);
  });
  console.log('');
  console.log('------------------------------------------------------------');
  const username = await ask(' Username (english letters, no spaces) : ');
  if (!username) { console.log(' Cancelled - username is required.'); return i.close() }
  const name = await ask(' Full name (Thai is OK here)           : ');
  console.log('');
  console.log(' TIP: one person can hold MORE THAN ONE role -');
  console.log('      type them separated by commas, e.g.  sales_front,delivery');
  console.log('');
  let role = await ask(' Role(s)  [press ENTER for manager]    : ');
  role = role || 'manager';
  const roles = role.split(/[,\s]+/).map(r => r.trim()).filter(Boolean);
  const bad = roles.filter(r => !ROLES[r]);
  if (bad.length) { console.log('\n [X] No such role: ' + bad.join(', ')); return i.close() }
  const password = await ask(' Password (at least 4 characters)      : ');
  if (password.length < 4) { console.log('\n [X] Password too short.'); return i.close() }

  try {
    const u = auth.addUser({ username, name: name || username, roles, password });
    console.log('');
    console.log('============================================================');
    console.log('  [OK] User created');
    console.log('       username : ' + u.username);
    console.log('       name     : ' + u.name);
    console.log('       role(s)  : ' + (u.roles||[u.role]).map(r => ROLES[r].nameEn).join('  +  '));
    console.log('');
    console.log('  NEXT STEP: close this window, then run  3-START' + EXT);
    console.log('============================================================');
    console.log('');
  } catch (e) {
    console.log('');
    console.log(' [X] ' + (e.message === 'username_taken'
      ? 'That username already exists - pick another one.'
      : e.message));
    console.log('');
  }
  i.close();
})();
