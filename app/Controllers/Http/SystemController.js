'use strict'
const Env = use('Env')

class SystemController {

    async fetch_page_body ({request, response }) {

        const BRANCH_NAME = Env.get('BRANCH_NAME', 'NOVALICHES')
        response.status(200).send({ BRANCH_NAME })
    }
    
}

module.exports = SystemController
