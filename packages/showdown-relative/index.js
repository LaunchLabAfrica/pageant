const handlebars = require('handlebars')

module.exports = function (path) {
  const self = this
  this.relativePath = path || '/'
  this.extension = function () {
    return [
      {
        type: 'lang',
        filter: function (text) {
          const data = { relativePath: self.relativePath }
          return handlebars.compile(text)(data)
        }
      }
    ]
  }
}
