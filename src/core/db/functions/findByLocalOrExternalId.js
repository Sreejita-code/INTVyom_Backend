/**
 * Resolve a document by local Mongo _id OR its external id field, scoped to a user.
 * Keeps the strict 24-hex check so a non-ObjectId string only matches the external field.
 */
const findByLocalOrExternalId = (Model, id, userId, extField, extra = {}) =>
  Model.findOne({
    $or: [
      { _id: id.match(/^[0-9a-fA-F]{24}$/) ? id : null },
      { [extField]: id },
    ],
    user_id: userId,
    ...extra,
  });

module.exports = findByLocalOrExternalId;
