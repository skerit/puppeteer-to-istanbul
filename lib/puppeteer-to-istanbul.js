const fs = require('fs')
const OutputFiles = require('./output-files')
const mkdirp = require('mkdirp')
const PuppeteerToV8 = require('./puppeteer-to-v8')
const v8toIstanbul = require('v8-to-istanbul')

let jsonPart = {}

class PuppeteerToIstanbul {
  constructor (coverageInfo, options = {}) {
    this.storagePath = options.storagePath || './.nyc_output'
    this.includeHostname = options.hasOwnProperty('includeHostname') ? options.includeHostname : true

    this.coverageInfo = coverageInfo
    this.options = options
    this.puppeteerToConverter = OutputFiles(coverageInfo, options).getTransformedCoverage()
    this.puppeteerToV8Info = PuppeteerToV8(this.puppeteerToConverter).convertCoverage()
  }

  setCoverageInfo (coverageInfo) {
    this.coverageInfo = coverageInfo
  }

  async writeIstanbulFormat () {
    mkdirp.sync(this.storagePath)

    const outFilePath = `${this.storagePath}/out.json`

    fs.writeFileSync(outFilePath, '')

    const fd = fs.openSync(outFilePath, 'a')

    let line;

    for (const jsFile of this.puppeteerToV8Info) {
      // the path to the original source-file is required, as its contents are
      // used during the conversion algorithm.

      const script = v8toIstanbul(jsFile.url)

      // this is required due to the async source-map dependency
      await script.load()

      // Since 2019, v8-to-istanbul marks each line as covered by default.
      // But because we only report covered lines, they never get set to 0.
      for (line of script.source.lines) {
        line.count = 0;
      }

      script.applyCoverage(jsFile.functions)

      // output coverage information in a form that can be consumed by Istanbul.
      let istanbulCoverage = script.toIstanbul()
      let keys = Object.keys(istanbulCoverage)

      if (jsonPart[keys[0]]) {
        mergeCoverageData(jsonPart[keys[0]].s, istanbulCoverage[keys[0]].s)
      } else {
        jsonPart[keys[0]] = istanbulCoverage[keys[0]]
      }
      jsonPart[keys[0]].originalUrl = jsFile.originalUrl
    }

    fs.writeSync(fd, '{')
    Object.keys(jsonPart).forEach((url, index, keys) => {
      const data = jsonPart[url]
      const isLastIteration = index === (keys.length - 1)

      if (data.originalUrl && data.originalUrl[0] == '/') {
        data.path = data.originalUrl;
      }

      fs.writeSync(fd, `${JSON.stringify(url)}: ${JSON.stringify(data)}${(isLastIteration ? '' : ',')}`)
    })
    fs.writeSync(fd, '}')
    fs.closeSync(fd)
  }
}

function mergeCoverageData (obja, objb) {
  Object.keys(obja).forEach(key => {
    obja[key] = (obja[key] || objb[key]) ? 1 : 0
  })
  return obja
}

function genPuppeteerToIstanbul (coverageInfo, options) {
  return new PuppeteerToIstanbul(coverageInfo, options)
}

genPuppeteerToIstanbul.resetJSONPart = function () {
  jsonPart = {}
}

genPuppeteerToIstanbul.getJSONPart = function () {
  return JSON.parse(JSON.stringify(jsonPart))
}

genPuppeteerToIstanbul.mergeCoverageData = mergeCoverageData

module.exports = genPuppeteerToIstanbul
