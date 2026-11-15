// functions/index.js
// OPTIONAL. A static web page cannot delete another user's Firebase Authentication
// record — only the Admin SDK can. Deploy this callable function to make the
// "Delete account" button remove the login record as well.
//
// Deploy:
//   npm i -g firebase-tools
//   firebase login
//   firebase init functions        (JavaScript, existing project: name-label)
//   replace functions/index.js with this file
//   cd functions && npm i firebase-functions firebase-admin
//   firebase deploy --only functions
//
// Requires the Blaze plan. After deployment set AUTH_DELETE_ENDPOINT near the top
// of the admin page script to:
//   https://asia-east1-name-label.cloudfunctions.net/deleteUserAccount
//
// Without this function the button still removes the profile and all access;
// the login record must then be deleted in Firebase Console → Authentication → Users.

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

exports.deleteUserAccount = functions.region('asia-east1').https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in required');

  const caller = context.auth.uid;
  const db = admin.database();
  const [ad, us] = await Promise.all([
    db.ref('admins/' + caller).once('value'),
    db.ref('users/' + caller).once('value')
  ]);
  const u = us.val() || {};
  const isAdmin = ad.val() === true || (u.role === 'admin' && u.status === 'approved');
  if (!isAdmin) throw new functions.https.HttpsError('permission-denied', 'Admin only');

  const uid = String((data && data.uid) || '');
  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid required');
  if (uid === caller) throw new functions.https.HttpsError('failed-precondition', 'Cannot delete your own account');

  await admin.auth().deleteUser(uid).catch(e => {
    if (e.code !== 'auth/user-not-found') throw e;
  });
  await Promise.all([
    db.ref('users/' + uid).remove(),
    db.ref('admins/' + uid).remove()
  ]);

  return { ok: true, uid };
});
