'use strict';

var async = require('async');

module.exports = function(callback) {
  var dbConv = this,
    hosts = dbConv.connections;

  dbConv.log.info('Starting migration process...');

  async.eachSeries(dbConv.config.mapping, function(mapping, seriesCb) {
      async.auto({
          init: function(cb) {
            var config, tables = mapping.table.split(':');

            config = {
              tableFrom: tables[0],
              tableTo: tables[1]
            };

            hosts.fromHost.useCollection(config.tableFrom);
            hosts.toHost.useCollection(config.tableTo);

            cb(null, config);
          },
          drop: ['init', function(cb, config) {
            if (!dbConv.config.drop) {
              return cb(null);
            }

            dbConv.log.verbose('Removing table `%s`...', config.init
              .tableTo);

            hosts.toHost.drop(function(err) {
              if (err && err.message === 'ns not found') {
                dbConv.log.info(
                  'Database has no table `%s`, not removed!',
                  config.init.tableTo);
              } else {
                dbConv.log.info(
                  'Table `%s` removed successfully.',
                  config.init.tableTo);
              }

              cb(null);
            });
          }],
          collect: ['init', function(cb, config) {
            dbConv.log.verbose('Collecting data from table `%s`...',
              config.init
              .tableFrom);

            hosts.fromHost.findAll(function(data) {
              dbConv.log.info(
                'Found %s entries in table `%s`.',
                data.length,
                config.init.tableFrom);
              cb(null, data);
            });
          }],
          convert: ['collect', 'drop', function(cb, entries) {
            dbConv.log.verbose(
              'Converting %s entries to write to `%s`...',
              entries.collect.length,
              entries.init.tableTo);
            var tasks = [];

            entries.collect.forEach(function(entry) {
              tasks.push(function(callback) {
                dbConv.converter(entry, mapping, callback);
              });
            });

            async.parallel(tasks, function(err, converted) {
              dbConv.log.info(
                'Conversion done for %s entries successfully.',
                converted.length);
              cb(err, converted);
            });
          }],
          merge: ['convert', function(cb, entries) {
            dbConv.merge(entries.convert, mapping, cb);
          }],
          write: ['merge', function(cb, entries) {
            dbConv.log.verbose(
              'Writing %s entries into `%s`...',
              entries.merge.length,
              entries.init.tableTo);
            hosts.toHost.insert(entries.merge, function(err, res) {
              if (err) {
                return cb(err);
              }
              dbConv.log.info(
                'Wrote %s entries into `%s` successfully.',
                res.insertedIds.length,
                entries.init.tableTo);
              dbConv.log.verbose(
                'Saving ids of inserted entries for rollback...'
              );
              hosts.toHost.useCollection('_dbConvertRollback_');
              hosts.toHost.insert({
                createdAt: new Date().getTime(),
                tablename: entries.init.tableTo,
                ids: res.insertedIds
              }, function(error) {
                if (!error) {
                  dbConv.log.verbose(
                    'Ids saved for rollback successfully.'
                  );
                }
                cb(error, entries.merge);
              });
            });
          }]
        },
        function(err) {
          seriesCb(err);
        });
    },
    function(err) {
      if (!err) {
        dbConv.log.info('Migration process successfully completed.');
      } else {
        dbConv.log.error(err.error);
      }

      return callback(err);
    });
};
