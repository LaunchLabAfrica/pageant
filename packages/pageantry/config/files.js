import {
  stat,
  existsSync,
  mkdir,
  readdir,
  writeFile,
  readFile,
} from 'fs'
import { join } from 'path'
import toPromise from 'denodeify'

export const isDirectory = async directory => {
  try {
    const stats = await toPromise(stat)(directory)
    return stats.isDirectory()
  } catch (err) {
    console.error(err)
  }
}

export const pathExists = path => existsSync(path)

export const createDirectory = async (path, dir) => {
  try {
    await toPromise(mkdir)(join(path, dir), { recursive: true })
  } catch(err) {
    console.error(err)
  }
}


export const existsInDirectory = async (directory, pathname) => {
  try {
    const files = await toPromise(readdir)(directory)
    return files.includes(pathname)
  } catch(err) {
    console.error(err)
  }
}

export const writeToFile = async (file, content) => {
  try {
    return await toPromise(writeFile)(file, content, 'utf8')
  } catch(err) {
    console.error(err)
  }
}

export const readFromFile = async file => {
  try {
    return await toPromise(readFile)(file, 'utf8')
  } catch(err) {
    console.error(err)
  }
}

