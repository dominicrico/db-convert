/*eslint complexity: [2, 8]*/

'use strict';

/**
 * Module dependencies.
 */

var mysql = require('mysql');
var util = require('util');
var _ = require('lodash');
var async = require('async');

/**
 * Expose `MySql`.
 */

module.exports = MySql;

/**
 * Initialize a new MySql Adapter with the given `config`
 *
 * @param {Object} config
 * @api private
 */

function MySql(config, cb) {
  this.config = config;
  this.db = null;

  this.pk = config.pk || 'id';

  this.connect(cb);

  this.connect = _.bind(this.connect, this);
  this.insert = _.bind(this.insert, this);
  this.useCollection = _.bind(this.useCollection, this);
  this.drop = _.bind(this.drop, this);
  this.close = _.bind(this.close, this);
  this.createTable = _.bind(this.createTable, this);
}

/**
 * Connect to the database.
 *
 * @api private
 */

MySql.prototype.connect = function(callback) {
  var self = this;

  try {
    self.db = mysql.createConnection(this.config.href);
    self.db.connect();
    self.db.query('SET GLOBAL wait_timeout=86400', function() {
      self.db.query('RESET QUERY CACHE');
    });
    self.collection = null;
  } catch (e) {
    return (callback) ? callback(e) : true;
  } finally {
    return (callback) ? callback(null) : true;
  }
};

MySql.prototype.close = function(callback) {
  var self = this;
  this.db.query('SET GLOBAL wait_timeout=86400', function() {
    self.db.end(function(err) {
      self.db = undefined;
      self.collection = undefined;
      return (callback) ? callback(err) : true;
    });
  });
};

MySql.prototype.useCollection = function(collection) {
  this.collection = collection;
  return this.collection;
};

/**
 * Insert statement
 *
 * @api private
 */

MySql.prototype.insert = function(data, callback) {
  var self = this,
    stmts = [],
    createStmt = this.createTable(this.config.mappings, this.collection, true),
    insertStmt = util.format('INSERT INTO `%s` SET ?', this.collection);
  if (!data.length) {
    data = [data];
  }

  _.each(data, function(row) {
    _.each(row, function(val, key) {
      if (_.isPlainObject(val)) {
        row[key] = JSON.stringify(val);
      } else if (_.isArray(val)) {
        row[key] = val.join(',');
      }
    });

    stmts.push(function(cb) {
      self.db.query(insertStmt, row, function(err,
        res) {
        cb(err, res);
      });
    });

  });

  this.db.query(createStmt, function() {
    async.parallel(stmts, function(err, result) {
      var res = {
        insertedIds: [],
        ok: 1
      };
      console.log(err);
      _.each(result, function(val) {
        res.insertedIds.push(val.insertId);
      });

      if (err) {
        res.ok = 0;
      }

      callback(err, res);
    });
  });
};

/**
 * Drop collection
 *
 * @api private
 */

MySql.prototype.drop = function(callback) {
  var query = util.format('DROP TABLE `%s`', this.collection);

  this.db.query(query, function(
    err, data) {
    if (err) {
      //surprese this err...
      err = null;
    }
    return (callback) ? callback(data) : true;
  });
};

/**
 * Find all documents in a collection
 *
 * @api private
 */

MySql.prototype.findAll = function(callback) {
  var query = util.format('SELECT * FROM `%s`', this.collection);

  this.db.query(query, function(err, data) {

    if (err) {
      throw Error(err);
    }

    return (callback) ? callback(data) : true;
  });
};

/**
 * Find one document in a collection by key = value
 *
 * @api private
 */

MySql.prototype.findOne = function(key, value, callback) {
  var query = util.format('SELECT * FROM `%s` WHERE %s in (%s) LIMIT 1',
    this.collection,
    key, value);

  this.db.query(query, function(err, data) {

    if (err) {
      throw Error(err);
    }

    return (callback) ? callback(data) : true;
  });
};

/**
 * Count all documents in a collection
 *
 * @api private
 */

MySql.prototype.count = function(callback) {
  var query = util.format('SELECT COUNT(*) FROM `%s`', this.collection);

  this.db.query(query, function(err, data) {
    if (err) {
      throw Error(err);
    }
    return (callback) ? callback(data) : true;
  });
};

/**
 * Remove documents in a collection
 *
 * @api private
 */

MySql.prototype.delete = function(id, callback) {
  var query = util.format('DELETE FROM `%s` WHERE %s = %s', this.collection,
    this.pk, id);

  this.db.query(query, function(err) {
    var result = {
      result: {}
    };

    if (err) {
      throw Error(err);
    } else {
      result.result.ok = true;
    }

    return (callback) ? callback(result) : true;
  });
};

MySql.prototype.createTable = function(mapping, collection, ifNotExists,
  fromHost) {
  fromHost = (fromHost) ? 0 : 1;

  var fields = [];
  if (mapping && collection !== '_dbConvertRollback_') {
    mapping.forEach(function(table) {
      if (table.table.split(':')[fromHost] === collection) {
        fields.push('id_old varchar(255)');
        table.fields.forEach(function(field) {
          var name = (fromHost === 1) ? field[Object.keys(field)[0]] :
            Object.keys(field)[0];

          switch (field.type) {
            case 'string':
            case 'array':
            case 'json':
              fields.push(name + ' varchar(255)');
              break;
            case 'integer':
              fields.push(name + ' int');
              break;
            case 'timestamp':
              fields.push(name + ' timestamp');
              break;
            default:
              fields.push(name + ' varchar(255)');
          }
        });
      }
    });
  } else if (mapping && collection === '_dbConvertRollback_') {
    fields = ['ids varchar(255)',
      'createdAt timestamp',
      'tablename varchar(255)'
    ];
  }

  fields.push('id int NOT NULL AUTO_INCREMENT PRIMARY KEY');

  ifNotExists = (ifNotExists) ? 'IF NOT EXISTS' : '';

  return util.format('CREATE TABLE %s `%s` (%s)', ifNotExists,
    collection,
    fields.join(', '));
};
