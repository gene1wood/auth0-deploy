const _ = require('lodash');

const configuration = require('./modules/global/configuration.js');
const context = require('./modules/contexts/context.js');
const Global = require('./modules/global/global.js');
const user = require('./modules/users/user.js');

const loader = require('./modules/rule-loader.js');
const rule = loader.load('configuration-dumper.js', false);


// jest setup to reset _user and _context, preventing tests from writing to objects
beforeEach(() => {
  _user = _.cloneDeep(user);
  _context = _.cloneDeep(context);
  output = undefined;
});


test('does not change user or context', async () => {
  output = await rule(_user, _context, configuration, Global);
  expect(output.context._log.log[0]).toContain('Configuration Dump:');

  // delete the log as generated by the rule-loader
  delete output.context._log;

  expect(output.context).toEqual(context);
  expect(output.user).toEqual(user);
});
