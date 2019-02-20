import isBuiltin from 'is-builtin-module'
import peerDepsExternal from 'rollup-plugin-peer-deps-external'
import resolve from 'rollup-plugin-node-resolve'
import replace from 'rollup-plugin-replace'
import sourcemaps from 'rollup-plugin-sourcemaps'
import json from 'rollup-plugin-json'
import copy from 'rollup-plugin-copy-assets'
import commonjs from 'rollup-plugin-commonjs'
import babel from 'rollup-plugin-babel'
import postcss from 'rollup-plugin-postcss'
import filesize from 'rollup-plugin-filesize'
import minify from 'rollup-plugin-babel-minify'
import { terser } from 'rollup-plugin-terser'
import visualizer from 'rollup-plugin-visualizer'
import localResolve from 'rollup-plugin-local-resolve'
import autoprefixer from 'autoprefixer'
import pkg from './package.json'

/**
 * TODO:
 * 2. configure svgo https://github.com/porsager/rollup-plugin-svgo
 * 3. client bundle https://gitlab.com/thekelvinliu/rollup-plugin-static-site
 */

const isDev = process.env.NODE_ENV === 'development'

const commonPlugins = [
  peerDepsExternal({
    includeDependencies: true,
  }),
  visualizer({
    title: 'Pageantry',
    file: './stats.html'
  }),
  sourcemaps(),
  json(),
  localResolve(),
  resolve(),
  commonjs(),
  babel({
    exclude: ['node_modules/**']
  }),
]

const configBase = {
  external: id => isBuiltin(id) || new Set(Object.keys(pkg.dependencies)).has(id),
  plugins: commonPlugins
}

const server = {
  ...configBase,
  input: './bin/pageantry',
  output: [
    {
      name: pkg.name,
      banner: '#!/usr/bin/env node',
      file: pkg.main,
      format: 'cjs',
    }
  ],
  plugins: [
    ...configBase.plugins,
    replace({
      delimiters: ['', ''],
      '#!/usr/bin/env node': ''
    }),
    copy({
      assets: ['./assets']
    }),
  ],
}

const browser = {
  ...configBase,
  input: './assets/js',
  output: [
    {
      name: 'js',
      file: './dist/assets/js/bundle.js',
      format: 'iife',
    }
  ],
  plugins: [
    ...configBase.plugins,
    postcss({
      extract: isDev ? false : '/dist/assets/style/style.css',
      plugins: [autoprefixer],
      module: true
    }),
    filesize(),
    terser(),
    minify()
  ]
}

export default [
  server,
  browser
]
