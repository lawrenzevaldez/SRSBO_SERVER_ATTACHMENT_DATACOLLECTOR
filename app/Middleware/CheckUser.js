'use strict'
/** @typedef {import('@adonisjs/framework/src/Request')} Request */
/** @typedef {import('@adonisjs/framework/src/Response')} Response */
/** @typedef {import('@adonisjs/framework/src/View')} View */
const CustomException = use('App/Exceptions/CustomException')
const Env = use('Env')
const Redis = use('Redis')

const jwt   = require('jsonwebtoken')
const JWT_KEY = Env.get('JWT_KEY', 'secret')
class CheckUser {
  /**
   * @param {object} ctx
   * @param {Request} ctx.request
   * @param {Function} next
   */
  async handle ({ request }, next) {
    let header = request.header('Authorization')
    let bearer = header.split(' ')
    if(bearer[1] != 'null') {
        
        let token = bearer[1]
        let data  = await this.checkToken(token)
        let user_session = await Redis.get(data.user_id)
        let user_id      =  data.user_id
        request.user_id  = user_id
        if (user_session != user_id) {
          await Redis.set(user_id, user_id)
        }
        await next()
    } else {
      throw new CustomException({ message: "Session is expired please logout and login again !!"})
    }
  }

  async checkToken(token){
    try {
      return jwt.verify(token, JWT_KEY)
    } catch (error) {
      throw new CustomException({ message: "Session is expired please logout and login again !!"})
    }
  }
}

module.exports = CheckUser
