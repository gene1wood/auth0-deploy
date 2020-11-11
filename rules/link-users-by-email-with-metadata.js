/**
 * @title Link Accounts with Same Email Address while Merging Metadata
 * @overview Link any accounts that have the same email address while merging metadata.
 * @gallery true
 * @category access control
 *
 * This rule will link any accounts that have the same email address while merging metadata.
 * Source/Original: https://github.com/auth0/rules/blob/master/src/rules/link-users-by-email-with-metadata.js
 *
 * Please see https://github.com/mozilla-iam/mozilla-iam/blob/master/docs/deratcheting-user-flows.md#user-logs-in-with-the-mozilla-iam-system-for-the-first-time
 * for detailed explanation of what happens here.
 *
 */

function (user, context, callback) {
  const request = require('request');

  // Check if email is verified, we shouldn't automatically
  // merge accounts if this is not the case.
  if (!user.email || !user.email_verified) {
    return callback(null, user, context);
  }

  const userApiUrl = auth0.baseUrl + '/users';
  const userSearchApiUrl = auth0.baseUrl + '/users-by-email';

  request({
   url: userSearchApiUrl,
   headers: {
     Authorization: 'Bearer ' + auth0.accessToken
   },
   qs: {
     email: user.email
   }
  },
  function (err, response, body) {
    if (err) return callback(err);
    if (response.statusCode !== 200) return callback(new Error("API Call failed: " + body));

    var data = JSON.parse(body);
    // Ignore non-verified users
    data = data.filter(function(u) {
      return u.email_verified;
    });

    if (data.length === 1) {
      // The user logged in with an identity which is the only one Auth0 knows about
      // Do not perform any account linking
      return callback(null, user, context);
    }
    const firstSearchResult = data[0] || undefined;

    if (data.length === 2) {
      // Auth0 is aware of 2 identities with the same email address
      // The first search result of the /users-by-email API endpoint is the linked
      // account for that email address if there is one. It's followed by all unlinked accounts.

      if (firstSearchResult.identities && firstSearchResult.identities.length >= 1) {
        if (user.identities && user.identities.length > 1 && user.user_id ===
            firstSearchResult.user_id) {
          // The user has logged in with the already linked account, do nothing
          return callback(null, user, context);
        } else if (user.identities && user.identities.length === 1) {
          // The user has logged in with a not yet linked account, link it to firstSearchResult
          return linkAccount(firstSearchResult);
        }
      } else {
        // firstSearchResult is an identity with no linked secondaries
        if (firstSearchResult.user_id === user.user_id) {
          // Link the current user identity into the second search result identity
          return linkAccount(data[1]);
        }
        // Link the current user identity into the first search result identity
        return linkAccount(firstSearchResult);
        }
      }
    } else {
      // data.length is > 2 which, post November 2020 when all identities were
      // force linked manually, shouldn't be possible
      var error_message = `Error linking account ${user.user_id} as there are ` +
          `over 2 identities with the email address ${user.email} ` +
          data.map(x => x.user_id).join();
      console.log(error_message);
      return callback(new Error(error_message));
    }
  });

  const linkAccount = primaryUser => {
    // Link the current logged in identity as a secondary into primaryUser as a primary
    console.log(`Linking secondary identity ${user.user_id} into primary identity ${primaryUser.user_id}`);

    // Update app, user metadata as Auth0 won't back this up in user.identities[x].profileData
    user.app_metadata = user.app_metadata || {};
    user.user_metadata = user.user_metadata || {};
    auth0.users.updateAppMetadata(primaryUser.user_id, user.app_metadata)
    .then(auth0.users.updateUserMetadata(primaryUser.user_id, Object.assign({}, user.user_metadata, primaryUser.user_metadata)))
    // Link the accounts
    .then(function() {
      request.post({
        url: userApiUrl + '/' + primaryUser.user_id + '/identities',
        headers: {
          Authorization: 'Bearer ' + auth0.accessToken
        },
        json: { provider: user.identities[0].provider, user_id: String(user.identities[0].user_id) }
      }, function (err, response, body) {
        if (response && response.statusCode >= 400) {
          console.log("Error linking account: " + response.statusMessage);
          return callback(new Error('Error linking account: ' + response.statusMessage));
        }
        // Finally, swap user_id so that the current login process has the correct data
        context.primaryUser = primaryUser.user_id;
        context.primaryUserMetadata = primaryUser.user_metadata || {};
        return callback(null, user, context)
      });
    })
    .catch(function (err) {
      console.log("An unknown error occurred while linking accounts: " + err);
      return callback(err);
    });
  }
}
