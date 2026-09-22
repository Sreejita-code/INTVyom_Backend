// Read-only audit of users that share a user_name. The unique index on users.user_name cannot
// build while any exist, and login (which looks users up by user_name) can only ever reach the
// first of them. Lists every group so a human can rename all but one; it makes no writes.
//   node scripts/audit-duplicate-usernames.js
//
// Exit 1 when any duplicate exists, 0 otherwise, so it can gate a deploy.
const mongoose = require('mongoose');
const connectDB = require('../src/core/db/dbConnect');
const User = require('../src/core/db/schemas/user.model');

const run = async () => {
  await connectDB();

  const groups = await User.aggregate([
    { $group: { _id: '$user_name', users: { $push: { id: '$_id', email: '$user_email', created: '$createdAt' } }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { _id: 1 } },
  ]);

  for (const group of groups) {
    console.log(`user_name '${group._id}' is shared by ${group.count} users:`);
    for (const user of group.users) console.log(`  ${user.id} ${user.email} created ${user.created?.toISOString?.() ?? 'unknown'}`);
  }

  if (groups.length > 0) {
    console.log(
      `\n${groups.length} duplicated user_name(s). Rename all but one user in each group ` +
      '(tell those users their new login name), then restart the service so Mongoose builds the ' +
      'unique index. Until then the index build fails and duplicates stay possible.'
    );
  } else {
    console.log('No duplicated user_name. The unique index can build.');
  }

  await mongoose.disconnect();
  process.exit(groups.length > 0 ? 1 : 0);
};

run().catch(async (err) => {
  console.error(`audit-duplicate-usernames failed: ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
