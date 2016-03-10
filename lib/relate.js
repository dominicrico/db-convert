'use strict';

var async = require('async');
var _ = require('lodash');

module.exports = function(configOverride, callback) {
  var dbConvert = this;
  var t = new Date().getTime();

  if (_.isFunction(configOverride)) {
    callback = configOverride;
    configOverride = {};
  }

  if ((configOverride._ && configOverride._.indexOf('rel') === -1 ||
      dbConvert.config && dbConvert.config._ && dbConvert.config._.indexOf(
        'rel') === -1)) {
    dbConvert.doRelate(callback);
  } else {
    async.series([
      function(cb) {
        dbConvert.load(configOverride, cb);
      },

      dbConvert.initialize,

      dbConvert.connect,

      dbConvert.doRelate

    ], function dbConvertDone(err) {
      if (err) {
        dbConvert.log.error(err.message);
      }

      dbConvert.down(function() {

        t = (new Date().getTime() - t);
        dbConvert.log.info('Conversion took %s minutes to complete.',
          dbConvert.helpers.msToHuman(t));

        if (callback) {
          return callback(null);
        }
      });
    });
  }
};
