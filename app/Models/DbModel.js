'use strict'

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use('Model')
const Db = use('Database')
const Env = use('Env')
const internalIp = use('internal-ip')
const leftPad = use('left-pad')
const trim = use('trim')
const br_code = Env.get('BRANCH_CODE', '')
const _ = use('lodash')
const CustomException = use('App/Exceptions/CustomException')

const moment = require('moment')
const TO_DATE = Env.get('TO_DATE')

class DbModel extends Model {

  async getAllSupplier(brCode="") {
  if (brCode == "") {
          let row = await Db.connection('srspos')
                            .select('description', 'vendorcode')
                            .from('vendor')
    return (row.length.length == 0) ? "" : row
  }
  let row = await Db.connection('srspos')
                        .select('description', 'vendorcode')
                        .from('vendor')
      return (row.length.length == 0) ? "" : row
  }
    
  async getNameAll(loginid, brCode=""){
    if (brCode == "") {
      let row = await Db.connection('srspos')
                        .select('loginid', 'name')
                        .from('MarkUsers')
      return row
    } else {
            let row = await Db.connection('srspos')
                              .select('loginid', 'name')
                              .from('MarkUsers')
      return row
    }
  }
}

module.exports = new DbModel