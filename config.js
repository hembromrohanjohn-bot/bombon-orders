/* ============================================================
   BOMBON ORDERS BOARD — settings
   ============================================================ */
const CONFIG = {
  // Same Firebase project as the menu (bombon-menu/config.js). These values are meant to be public;
  // the Firestore rules (firebase/firestore.rules) only let signed-in staff see or change orders.
  firebase: {
    apiKey: "AIzaSyA_VOzrlvhNsPqf5q5oFOmuMfFMnItxBrI",
    authDomain: "bombon-orders-ucwmp.firebaseapp.com",
    projectId: "bombon-orders-ucwmp",
    storageBucket: "bombon-orders-ucwmp.firebasestorage.app",
    messagingSenderId: "175080005253",
    appId: "1:175080005253:web:e6778bfbb5638053cb93ec",
  },
  staffDomain: "bombon.staff",   // the username "staff" signs in as staff@bombon.staff

  lateMinutes: 10,       // a New order older than this is flagged
  currency: "₹",
  menuUrl: "https://hembromrohanjohn-bot.github.io/bombon-menu/",
};
