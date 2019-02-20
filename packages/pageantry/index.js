import fs from 'fs'
import path from 'path'
import toPromise from 'denodeify'
import micro, { send } from 'micro'
import mime from 'mime'
import { parse } from 'url'
import handlebars from 'handlebars'
import layouts from 'handlebars-layouts'
import showdown from 'showdown'
import twitter from 'showdown-twitter'
import relative from '@pageantry/showdown-relative'
import highlight from '@pageantry/showdown-highlight'
import youtube from 'showdown-youtube'
import hljs from 'highlight.js'
import unslug from 'unslug'
import LRUCache from 'lru-cache'
import merge from 'deepmerge'

import {
  pathExists,
  isDirectory
} from './config/files'

handlebars.registerHelper(layouts(handlebars))

/**
* Handlebar helpers
*/
handlebars.registerHelper('year', () => new Date().getFullYear())

// Load partials
fs.readdirSync('./assets/views/partials')
  .forEach(file => {
    if (file.endsWith('.hbs')) {
      const partial = file.replace('.hbs', '')
      handlebars.registerPartial(partial, fs.readFileSync(`./assets/views/partials/${file}`, 'utf8'))
    }
  })

let cachedView = null
let cachedAsset = {}
let converter

const ssrCache = new LRUCache({
  max: 100,
  maxAge: 1000 * 60 * 60
})


const initConverter = (config) => {
  const { flavor, options } = config
  if (converter) return converter
  converter = new showdown.Converter(options)
  converter.setFlavor(flavor)
  return converter
}

// const relativePathExtension = function (path) {
//   const self = this
//   this.relativePath = path || '/'
//   this.extension = function () {
//     return [
//       {
//         type: 'lang',
//         filter: function (context) {
//           const data = { relativePath: self.relativePath }
//           return handlebars.compile(context)(data)
//         }
//       }
//     ]
//   }
// }

const relativeExtension = new relative()
showdown.extension('relative', relativeExtension.extension)

const videoExtension = function () {
  return [
    {
      type: 'lang',
      filter: function (text, converter, options) {
        const regex = /!\[[^\]]*\]\(.*?\.(?:mp4).*?(?=\"|\))(\".*\")?\)/g
        const matches = regex.exec(text)
        return text
      }
    }
  ]
}

showdown.extension('video', videoExtension)
//
//
// const codehighlightExtension = function () {
//   function htmlunencode(text) {
//     return (
//       text
//         .replace(/&amp;/g, '&')
//         .replace(/&lt;/g, '<')
//         .replace(/&gt;/g, '>')
//       );
//   }
//   return [
//     {
//       type: 'output',
//       filter: function (text, converter, options) {
//         // use new shodown's regexp engine to conditionally parse codeblocks
//         var left  = '<pre><code\\b[^>]*>',
//             right = '</code></pre>',
//             flags = 'g',
//             replacement = function (wholeMatch, match, left, right) {
//               // unescape match to prevent double escaping
//               match = htmlunencode(match);
//               return left + hljs.highlightAuto(match).value + right;
//             };
//         return showdown.helper.replaceRecursiveRegExp(text, replacement, left, right, flags);
//       }
//     }
//   ];
// }

showdown.extension('codehighlight', highlight);

const getCacheKey = dirPath => `${dirPath}`

const isMarkdown = pathObj => {
  if (pathObj.ext === '.md') return true
  return false
}

export const pageantry = async ({ dir, config, dev }) => {

  const root = path.resolve(process.cwd(), dir)
  const rootObj = path.parse(root)

  // TODO: add extensions

  converter = initConverter(config.converter)

  const imageExtensions = new Set(config.extensions.image)
  const downloadExtensions = new Set(config.extensions.download)
  const ignoredFiles = new Set(config.extensions.exclude)

  const getView = async () => {
    if (!cachedView || dev) {
      try {
        const context = await toPromise(fs.readFile)(
          path.resolve(__dirname, '../assets/views/default.hbs'),
          'utf8'
        )
        cachedView = handlebars.compile(context)
      } catch(err) {
        throw err
      }
    }
    return cachedView
  }

  const getAsset = async assetPath => {
    if (!cachedAsset[assetPath] || dev) {
      try {
        const file = await toPromise(fs.readFile)(
          path.resolve(__dirname, '../assets', assetPath),
          'utf8'
        )
        cachedAsset[assetPath] = file
      } catch(err) {
        throw err
      }
    }
    return cachedAsset[assetPath]
  }

  const toHtml = async (dirPath, filePath) => {
    const file = await toPromise(fs.readFile)(filePath, 'utf8')
    relativeExtension.relativePath = dirPath.replace(rootObj.name, '')
    if (file) return converter.makeHtml(file)
  }

  const renderDir = async directory => {
    const files = await toPromise(fs.readdir)(directory)
    const dirObj = path.parse(directory)
    let dirPath = `${dirObj.dir}/${dirObj.base}`.replace(`${rootObj.dir}/`, ``)
    let dirPathParts = dirPath.split('/')

    const key = getCacheKey(dirPath)

    if (ssrCache.has(key)) {
      return ssrCache.get(key)
    }

    const data = {
      directories: [],
      images: [],
      downloads: [],
      path: [],
      page: {},
      assetsDir: '../assets',
      folder: dirObj.name,
    }

    let url = []
    for (let i = 0; i < dirPathParts.length; ++i) {
      if (dirPathParts[i] !== rootObj.base) {
        url.push(dirPathParts[i])
      }
      data.path.push({
        url: url.join('/'),
        name: dirPathParts[i]
      })
    }

    for (let i = 0; i < files.length; ++i) {
      if (ignoredFiles.has(files[i])) continue
      const filePath = path.resolve(root, path.resolve(directory, files[i]))
      const pathObj = path.parse(filePath)

      const relativeFilePath = path.relative(
        root,
        path.resolve(directory, files[i])
      )
      if (await isDirectory(filePath)) {
        data.directories.push({
          relative: relativeFilePath,
          name: files[i].replace(/[_-]/g, ' ')
        })
      } else if (isMarkdown(pathObj)) {
        data.page.title = unslug(pathObj.name)
        data.page.canonical = `${dirPath.replace(rootObj.name, '')}/${pathObj.name}`
        data.page.content = await toHtml(dirPath, filePath)
        const metadata = converter.getMetadata()
        data.page = { ...data.page, ...metadata }
      } else if (imageExtensions.has(pathObj.ext)) {
        data.images.push({
          relative: relativeFilePath,
          name: files[i]
        })
      } else if (downloadExtensions.has(pathObj.ext)) {
        data.downloads.push({
          relative: relativeFilePath,
          extension: pathObj.ext.replace('.', ''),
          name: files[i]
        })
      }
    }
    const view = await getView()
    const enriched = view(data)
    ssrCache.set(key, enriched)
    return enriched
  }

  const renderFile = async file => {
    try {
      const content = await toPromise(fs.readFile)(path.resolve(root, file))
      return {
        content,
        mime: mime.getType(file)
      }
    } catch(err) {
      throw err
    }
  }


  const server = micro(async (req, res) => {
    const { pathname } = parse(req.url)
    const pathObj = path.parse(path.join(root, pathname))
    const reqPath = decodeURIComponent(path.format(pathObj))

    if (pathname.startsWith('/assets')) {
      const asset = await getAsset(pathname.replace('/assets/', ''))
      res.setHeader('Content-Type', `${mime.getType(pathname)}; charset=utf-8`)
      return send(res, 200, asset)
    }

    if (!pathExists(reqPath)) {
      const pathObj = path.parse(path.join(root, '/404'))
      const newReqPath = decodeURIComponent(path.format(pathObj))
      const renderedDir = await renderDir(newReqPath)
      return send(res, 404, renderedDir)
    }

    if (pathObj.ext === '') {
      const renderedDir = await renderDir(reqPath)
      return send(res, 200, renderedDir)
    } else if (imageExtensions.has(pathObj.ext)) {
      try {
        const image = await renderFile(reqPath)
        res.setHeader('Content-Type', `${image.mime}; charset=utf-8`)
        return send(res, 200, image.content)
      } catch(err) {
        const pathObj = path.parse(path.join(root, '/500'))
        const reqPath = decodeURIComponent(path.format(pathObj))
        const renderedDir = await renderDir(reqPath)
        return send(res, 500, renderedDir)
      }
    } else if (downloadExtensions.has(pathObj.ext)) {
      try {
        const download = await renderFile(reqPath)
        res.setHeader('Content-disposition', `attachment; filename=${pathObj.name}${pathObj.ext}`)
        res.setHeader('Content-Type', `${download.mime}`)
        return send(res, 200, download.content)
      } catch(err) {
        const pathObj = path.parse(path.join(root, '/500'))
        const reqPath = decodeURIComponent(path.format(pathObj))
        const renderedDir = await renderDir(reqPath)
        return send(res, 500, renderedDir)
      }
    } else {
      const pathObj = path.parse(path.join(root, '/500'))
      const reqPath = decodeURIComponent(path.format(pathObj))
      const renderedDir = await renderDir(reqPath)
      return send(res, 500, renderedDir)
    }
  })

  return server
}

export default pageantry

/***
 * TODO:
 * Plugins types showdown; App
 * Plugins could take the following form:
 * - extension (s)
 * - renderMethod
 *
 * 1. Image plugin
 * 2. Markdown plugin -- showdown,etc 
 * 3. Downloads plugin
 * 4. Preview plugin -- sketch, etc
 */

/***
 * TODO:
 * - categories
 * - tags
 * - shares to social networks (v2)
 * - share for blog post
 * - social links as part of config
 * - meta tags
 */

/**
 * Assets
 * - Js
 * - Css
 * - Views
 */


/****
 * Notes
 * ------
 *  - config file contains plugins, generator contains plugins,
 *  ``
 */

