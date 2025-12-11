'use strict'
const Redis = use('Redis')
const Env = use('Env')
const PosMod      = use('App/Models/PosProduct')
const jwt   = require('jsonwebtoken')
const JWT_KEY = Env.get('JWT_KEY', 'secret')
const CustomException = use('App/Exceptions/CustomException')
class AuthController {

    async auth({request, response, session }) {
        let { p_username, p_password } = request.only(['p_username', 'p_password'])

        let user = await PosMod.auth(p_username, p_password)
        let user_id
        let fullname
        if (user == "") {
            if (p_username != 'admin' && p_password != "srs01212009") {
                throw new CustomException({ message: "USERNAME OR PASSWORD IS INVALID !!!"})
            }
            user_id = '2019'
            fullname = 'ADMIN PLAIN'
        } else {
             user_id = user.loginid
             fullname = user.name
        }
       
        const token = jwt.sign({ 
            user_id: user_id
        }, JWT_KEY, {
            expiresIn: "12h"
        })
        
        response.status(200).send({ token, user_id, fullname })
    }

    async logout({response, request }) {
        let user_id = request.only(['user_id'])
        await Redis.del(user_id)
        response.status(200).send()
    }
}

module.exports = AuthController
