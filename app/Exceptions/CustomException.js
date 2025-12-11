'use strict'

const { LogicalException } = require('@adonisjs/generic-exceptions')

class CustomException extends LogicalException {

  handle (error, { response }) {
    const message = error.message
    response.status(error.status).json({ error:  message  })
  }

}

module.exports = CustomException
