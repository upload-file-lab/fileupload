// © Sanjaya

const axios = require('axios')
const acrcloud = require('acrcloud')
const cheerio = require('cheerio')
const { createDecipheriv } = require('crypto')
const fs = require('fs')
const ffmpeg = require('fluent-ffmpeg')
const FormData = require('form-data')
const path = require('path')
const { spawn, exec } = require('child_process')
const YTDL = require('@distube/ytdl-core')

const randomKarakter = (length) => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from({ length }, () => chars.charAt(Math.floor(Math.random() * chars.length))).join('')
}

const FileSize = (path) => {
  const bytes = fs.statSync(path).size
  if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB'
  if (bytes >= 1048576) return (bytes / 1048576).toFixed(2) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(2) + ' KB'
  return bytes + ' B'
}

async function catbox(path) {
  const data = new FormData()
  data.append('reqtype', 'fileupload')
  data.append('userhash', '')
  data.append('fileToUpload', fs.createReadStream(path))
  const config = {
    method: 'POST',
    url: 'https://catbox.moe/user/api.php',
    headers: {
      ...data.getHeaders(),
      'User-Agent': 'Mozilla/5.0 (Android 10; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0',
    },
    data: data
  }
  const api = await axios.request(config)
  return api.data
}

async function uguu(path) {
    try {
        const form = new FormData()
        form.append('files[]', fs.createReadStream(path))

        const { data } = await axios.post('https://uguu.se/upload', form, {
            headers: {
                ...form.getHeaders()
            }
        })

        return data.files[0].url
    } catch (err) {
        throw new Error(err.message)
    }
}

async function theoks(path) {
    try {
        let form = new FormData()
        form.append('files[]', fs.createReadStream(path))

        let { data } = await axios.post('https://pomf-api.theoks.net/upload.php', form, {
            headers: form.getHeaders()
        })

        return data.files[0].url
    } catch (err) {
        throw new Error(err.message)
    }
}

async function litterbox(path) {
    try {
        let form = new FormData()
        form.append('fileToUpload', fs.createReadStream(path))
        form.append('reqtype', 'fileupload')
        form.append('time', '24h')

        let { data } = await axios.post('https://litterbox.catbox.moe/resources/internals/api.php', form, {
            headers: {
                ...form.getHeaders()
            }
        })

        return data
    } catch (err) {
        throw new Error(err.message)
    }
}

async function cloudmini(path) {
    try {
        const file_buffer = fs.readFileSync(path)
        const file_type = path.split('.').pop()
        const file_name = path.split('/').pop()
        const unique_id = randomKarakter(2) + (file_buffer.length + file_type + file_name).length

        const form = new FormData()
        form.append('file', fs.createReadStream(path), `${unique_id}.${file_type}`)

        const response = await axios.post('https://files.cloudmini.net/upload', form, {
            headers: { ...form.getHeaders() }
        })

        const { filename } = response.data
        return `https://files.cloudmini.net/download/${filename}`
    } catch (err) {
        throw new Error(err.message)
    }
}

async function tempfiles(path) {
    try {
        const form = new FormData()
        form.append('file', fs.createReadStream(path))

        const { data } = await axios.post('https://tmpfiles.org/api/v1/upload', form, {
            headers: {
                ...form.getHeaders()
            }
        })

        return data.data.url
    } catch (err) {
        throw new Error(err.message)
    }
}

const QualsVideo = ["144", "240", "360", "480", "720", "1080"]
const QualsAudio = ['32', '64', '128', '192', '256', '320']

const downloadFolder = '/home/container'
if (!fs.existsSync(downloadFolder)) fs.mkdirSync(downloadFolder)

async function ytdlv1(url, type, qual = null) {
    let cookie
    const match = cookie?.match(/Expires=([^;]+)/)
    const date = match ? new Date(match[1]) : null
    const now = new Date()

    if (!cookie || (date && now > date)) {
        const yt_page = await axios.get("https://www.youtube.com", { timeout: 5000 })
        cookie = yt_page.headers['set-cookie']?.join('; ') || ''
    }

    const config = { requestOptions: { headers: { Cookie: cookie } } }
    const info = await YTDL.getInfo(url, config)
    const video = info.videoDetails
    const file_id = randomKarakter(8)

    if (type === 'mp3') {
        const file_path = `./${file_id}.mp3`

        const stream = YTDL(url, {
            filter: 'audioonly',
            highWaterMark: 32 * 1024 * 1024,
            requestOptions: { headers: { Cookie: cookie } }
        })

        const ffmpeg = spawn('ffmpeg', [
            '-i', 'pipe:0',
            '-b:a', `${qual}k`,
            '-preset', 'ultrafast',
            '-movflags', '+faststart',
            file_path
        ])

        stream.pipe(ffmpeg.stdin)

        await new Promise((resolve, reject) => {
            ffmpeg.on('close', resolve)
            ffmpeg.on('error', reject)
        })

        const file_size = FileSize(file_path)
        return {
            audio: {
                title: video.title,
                duration: video.lengthSeconds,
                views: video.viewCount,
                likes: video.likes,
                quality: qual + 'kbps',
                description: video.description,
                thumbnail: video.thumbnails.pop().url
            },
            channel: {
                name: video.ownerChannelName,
                subscriber: video.author.subscriber_count,
                verified: video.author.verified,
                url: video.author.channel_url
            },
            file_name: `${video.title}.mp3`,
            file_size,
            download: file_path
        }
    }

    const formats = info.formats.map(f => ({
        itag: f.itag,
        quality: f.qualityLabel || 'Audio',
        hasAudio: !!f.audioBitrate,
        url: f.url,
        type: f.mimeType.split(';')[0]
    }))

    let format_video = formats.find(f => f.quality.includes(`${qual}p`) && !f.hasAudio) || formats.find(f => f.quality.includes('p') && !f.hasAudio)
    let format_audio = formats.find(f => f.hasAudio)

    if (!format_video || !format_audio) return { availableFormats: formats }

    const video_path = `./${file_id}.mp4`

    const video_stream = YTDL(url, {
        quality: format_video.itag,
        highWaterMark: 64 * 1024 * 1024,
        requestOptions: { headers: { Cookie: cookie } }
    })

    const audio_stream = YTDL(url, {
        quality: format_audio.itag,
        highWaterMark: 32 * 1024 * 1024,
        requestOptions: { headers: { Cookie: cookie } }
    })

    const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:3',
        '-i', 'pipe:4',
        '-c:v', 'copy',
        '-c:a', 'aac',
        '-preset', 'ultrafast',
        '-movflags', '+faststart',
        video_path
    ], { stdio: ['ignore', 'ignore', 'ignore', 'pipe', 'pipe'] })

    video_stream.pipe(ffmpeg.stdio[3])
    audio_stream.pipe(ffmpeg.stdio[4])

    await new Promise((resolve, reject) => {
        ffmpeg.on('close', resolve)
        ffmpeg.on('error', reject)
    })

    const file_size = FileSize(video_path)
    return {
        video: {
            title: video.title,
            duration: video.lengthSeconds,
            views: video.viewCount,
            likes: video.likes,
            quality: format_video.quality,
            description: video.description,
            thumbnail: video.thumbnails.pop().url
        },
        channel: {
            name: video.ownerChannelName,
            subscriber: video.author.subscriber_count,
            verified: video.author.verified,
            url: video.author.channel_url
        },
        file_name: `${video.title}.mp4`,
        file_size,
        download: video_path
    }
}

async function ytdlv2(url, type, quality) {
  const api = {
    base: 'https://media.savetube.me/api',
    cdn: '/random-cdn',
    info: '/v2/info',
    download: '/download'
  }

  const headers = {
    accept: '*/*',
    'content-type': 'application/json',
    origin: 'https://yt.savetube.me',
    referer: 'https://yt.savetube.me/',
    'user-agent': 'Postify/1.0.0'
  }

  const vid_quality = ['144', '240', '360', '480', '720', '1080']
  const aud_quality = ['32', '64', '128', '192', '256', '320']

  const hex_to_buf = (hex) => Buffer.from(hex, 'hex')

  const decrypt = (enc) => {
    try {
      const secret_key = 'C5D58EF67A7584E4A29F6C35BBC4EB12'
      const data = Buffer.from(enc, 'base64')
      const iv = data.slice(0, 16)
      const content = data.slice(16)
      const key = hex_to_buf(secret_key)

      const decipher = createDecipheriv('aes-128-cbc', key, iv)
      let decrypted = Buffer.concat([decipher.update(content), decipher.final()])

      return JSON.parse(decrypted.toString())
    } catch (error) {
      throw new Error(error.message)
    }
  }

  const get_id = (url) => {
    const regex = [
      /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/
    ]
    for (let r of regex) {
      let match = url.match(r)
      if (match) return match[1]
    }
    return null
  }

  const dl_file = (url, file_path) => {
    return new Promise(async (resolve, reject) => {
      try {
        const response = await axios({
          url,
          method: 'GET',
          responseType: 'stream'
        })
        const writer = fs.createWriteStream(file_path)
        response.data.pipe(writer)
        writer.on('finish', () => resolve(file_path))
        writer.on('error', reject)
      } catch (error) {
        reject(error)
      }
    })
  }

  const convert_audio = (input, output, bitrate) => {
    return new Promise((resolve, reject) => {
      const process = spawn('ffmpeg', [
        '-i', 'pipe:0',
        '-b:a', `${bitrate}k`,
        '-preset', 'ultrafast',
        '-movflags', '+faststart',
        output
      ])
    
      const readStream = fs.createReadStream(input)
      readStream.pipe(process.stdin)

      process.on('close', (code) => {
        if (code === 0) resolve(output)
        else reject(new Error('Error :('))
      })
    })
  }

  const id = get_id(url)

  try {
    const { data: cdn_res } = await axios.get(api.base+api.cdn, { headers })
    const cdn = cdn_res.cdn

    const { data: info_res } = await axios.post(`https://${cdn}${api.info}`, {
      url: `https://www.youtube.com/watch?v=${id}`
    }, { headers })

    const decrypted = decrypt(info_res.data)

    if (type === 'mp4') {
      if (!vid_quality.includes(quality.toString())) quality = '360'
    } else if (type === 'mp3') {
      if (!aud_quality.includes(quality.toString())) quality = '192'
    }

    const { data: dl_res } = await axios.post(`https://${cdn}${api.download}`, {
      id,
      downloadType: type === 'mp3' ? 'audio' : 'video',
      quality,
      key: decrypted.key
    }, { headers })

    const file_name = `${randomKarakter(4)}.${type}`
    const file_path = './' + file_name

    await dl_file(dl_res.data.downloadUrl, file_path)

    if (type === 'mp3') {
      const output_file = `./${randomKarakter(4)}.mp3`
      await convert_audio(file_path, output_file, quality)
      fs.unlinkSync(file_path)
      return {
        title: decrypted.title,
        format: 'mp3',
        quality: quality+'kbps',
        duration: decrypted.duration,
        thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
        file_name: decrypted.title+'.mp3',
        file_size: FileSize(output_file),
        download: output_file
      }
    }

    return {
      title: decrypted.title,
      format: 'mp4',
      quality: quality+'p',
      duration: decrypted.duration,
      thumbnail: decrypted.thumbnail || `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
      file_name: decrypted.title+'.mp4',
      file_size: FileSize(file_path),
      download: file_path
    }
  } catch (err) {
    return { error: err.message }
  }
}

async function getTokenFB() {
  const { data: html } = await axios.get("https://fbdown.me/")
  const $ = cheerio.load(html)
  return $("#token").val()
}

async function fbdl(url) {
  try {
    const token = await getTokenFB()
    const formData = new FormData()
    formData.append("url", url)
    formData.append("token", token)

    const { data } = await axios.post(
      "https://fbdown.me/wp-json/aio-dl/video-data",
      formData,
      { headers: { ...formData.getHeaders() } }
    )

    return {
      title: data.title,
      thumbnail: data.thumbnail,
      videos: data.medias.map(v => ({
        url: v.url,
        quality: v.quality,
        size: v.formattedSize
      }))
    }
  } catch (err) {
    throw Error(err.message)
  }
}

async function igdl(url) {
  const { data } = await axios.post(
    'https://yt1s.io/api/ajaxSearch',
    new URLSearchParams({
      p: 'home',
      q: url,
      w: '',
      lang: 'en'
    }),
    {
      headers: {
        'User-Agent': 'Postify/1.0.0',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Accept': 'application/json, text/plain, */*',
        'Origin': 'https://yt1s.io',
        'Referer': 'https://yt1s.io/'
      }
    }
  )

  const $ = cheerio.load(data.data)

  return $('a.abutton.is-success.is-fullwidth.btn-premium')
    .map((_, el) => ({
      title: $(el).attr('title'),
      url: $(el).attr('href')
    }))
    .get()
}

async function ttdl(url) {
  return new Promise(async (resolve, reject) => {
    try {
      let data = []

      function formatNumber(integer) {
        let numb = parseInt(integer)
        return Number(numb).toLocaleString().replace(/,/g, '.')
      }

      function formatDate(n, locale = 'en') {
        let d = new Date(n)
        return d.toLocaleDateString(locale, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric'
        })
      }

      let domain = 'https://www.tikwm.com/api/'
      let res = await (await axios.post(domain, {}, {
        headers: {
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Origin': 'https://www.tikwm.com',
          'Referer': 'https://www.tikwm.com/',
          'Sec-Ch-Ua': '"Not)A;Brand" ;v="24" , "Chromium" ;v="116"',
          'Sec-Ch-Ua-Mobile': '?1',
          'Sec-Ch-Ua-Platform': 'Android',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-origin',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest'
        },
        params: {
          url: url,
          count: 12,
          cursor: 0,
          web: 1,
          hd: 1
        }
      })).data.data
      if (!res.size) {
        res.images.map(v => {
          data.push({
            type: 'photo',
            url: v
          })
        })
      } else {
        data.push({
          type: 'watermark',
          url: 'https://www.tikwm.com' + res.wmplay,
        }, {
          type: 'nowatermark',
          url: 'https://www.tikwm.com' + res.play,
        }, {
          type: 'nowatermark_hd',
          url: 'https://www.tikwm.com' + res.hdplay
        })
      }
      let json = {
        title: res.title,
        region: res.region,
        durations: res.duration,
        cover: 'https://www.tikwm.com' + res.cover,
        size_wm: res.wm_size,
        size_nowm: res.size,
        size_nowm_hd: res.hd_size,
        data: data,
        music_info: {
          id: res.music_info.id,
          title: res.music_info.title,
          author: res.music_info.author,
          album: res.music_info.album ? res.music_info.album : null,
          url: 'https://www.tikwm.com' + res.music || res.music_info.play
        },
        stats: {
          views: formatNumber(res.play_count),
          likes: formatNumber(res.digg_count),
          comment: formatNumber(res.comment_count),
          share: formatNumber(res.share_count),
          download: formatNumber(res.download_count)
        },
        author: {
          id: res.author.id,
          fullname: res.author.unique_id,
          nickname: res.author.nickname,
          avatar: 'https://www.tikwm.com' + res.author.avatar
        }
      }
      resolve(json)
    } catch (e) {
      reject(e)
    }
  })
}

async function ttslide(url) {
  try {
    const res = await axios({
      method: 'POST',
      url: 'https://tikvideo.app/api/ajaxSearch',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
      },
      data: new URLSearchParams({ q: url, lang: 'id' }).toString(),
    })

    const result = []
    if (res.data.status === 'ok') {
      const $ = cheerio.load(res.data.data)
      $('img').each((index, element) => {
        const imgSrc = $(element).attr('src')
        if (imgSrc && !imgSrc.includes('.webp')) {
          result.push(imgSrc)
        }
      })
    }

    return result.length > 0 ? result : null
  } catch (err) {
    throw Error(err.message)
  }
}

async function spotify(url) {
  try {
    const response = await axios.get(`https://api.siputzx.my.id/api/d/spotify?url=${encodeURIComponent(url)}`)
    return {
      title: response.data.data.title,
      download: response.data.data.download,
      image: response.data.data.image,
      duration: response.data.data.durasi
    }
  } catch (err) {
    console.error(err)
  }
}

async function capcut(url) {
  const BASE_URI = "https://snapsave.cc/wp-json/aio-dl/video-data"
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Content-Type': 'application/json;charset=UTF-8',
    'Connection': 'keep-alive',
    'Referer': 'https://snapsave.cc/capcut-video-downloader/',
    'Origin': 'https://snapsave.cc',
    'X-Requested-With': 'XMLHttpRequest',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'DNT': '1'
  }

  try {
    const response = await axios.get(`https://snapsave.cc/capcut-video-downloader/#url=${encodeURIComponent(url)}`, { headers })
    const $ = cheerio.load(response.data)
    const token = $("#token").val()

    const payload = {
      url,
      token,
      hash: "aHR0cHM6Ly93d3cuY2FwY3V0LmNvbS9pZC1pZC90ZW1wbGF0ZS1kZXRhaWwvRm9yLXlvdS0vNzQxNDE2Mjk3MzU3ODU2MjgyMg==1073YWlvLWRs"
    }

    const { data: videoData } = await axios.post(BASE_URI, payload, { headers })

    return {
      title: videoData.title,
      thumbnail: videoData.thumbnail,
      source: videoData.source,
      media: videoData.medias.map((item) => ({
        url: item.url,
        quality: item.quality,
        format: item.extension,
        size: item.formattedSize
      }))
    }

  } catch (err) {
    throw Error(err.message)
  }
}

async function threads(url) {
  try {
    const { data } = await axios.get('https://threads.snapsave.app/api/action', {
      params: { url: url },
      headers: {
        'accept': 'application/json, text/plain, */*',
        'referer': 'https://threads.snapsave.app/',
        'user-agent': 'Postify/1.0.0',
      },
      timeout: 10000,
    })

    const type = (type) => ({
      GraphImage: 'Photo',
      GraphVideo: 'Video',
      GraphSidecar: 'Gallery',
    }[type] || type)

    return {
      postInfo: {
        id: data.postinfo.id,
        username: data.postinfo.username,
        avatarUrl: data.postinfo.avatar_url,
        mediaTitle: data.postinfo.media_title,
        type: type(data.postinfo.__type),
      },
      media: data.items.map((item) => ({
        type: type(item.__type),
        id: item.id,
        url: item.url,
        width: item.width,
        height: item.height,
        ...(item.__type === 'GraphVideo' && {
          thumbnailUrl: item.display_url,
          videoUrl: item.video_url,
          duration: item.video_duration,
        }),
      })),
    }
  } catch (err) {
    throw Error(err.message)
  }
}

async function terabox(url) {
  const terabox = {
    api: {
      base: "https://teraboxdl.site/api/",
      token: "token",
      terabox: "terabox"
    },
    headers: {
      'authority': 'teraboxdl.site',
      'user-agent': 'Postify/1.0.0'
    },
    token: null
  }

  const getToken = async () => {
    if (terabox.token) return terabox.token

    try {
      const { data } = await axios.get(`${terabox.api.base}${terabox.api.token}`, { headers: terabox.headers })

      terabox.token = data.token
      return terabox.token

    } catch (err) {
      throw Error(err.message)
    }
  }

  const isUrl = (url) => {
    const match = url.match(/https?:\/\/(?:www\.)?(?:\w+)\.(com|app)\/s\/([^\/]+)/i)
    return match ? `https://1024terabox.com/s/${match[2]}` : null
  }

  const request = async (endpoint, params = {}) => {
    const token = await getToken()
    const url = `${terabox.api.base}${endpoint}?` + new URLSearchParams(params)

    try {
      const { data } = await axios.get(url, { headers: { ...terabox.headers, 'x-access-token': token } })
      const fileData = data.data.all_files[0]

      return {
        file_name: fileData.file_name,
        file_id: fileData.fs_id,
        size: fileData.size,
        thumbnail: fileData.thumb,
        download: fileData.download_url,
        bytes: fileData.sizebytes
      }

    } catch (err) {
      throw Error(err.message)
    }
  }

  const linkNya = isUrl(url.trim())
  return await request(terabox.api.terabox, { url: linkNya })
}

async function gdrive(url) {
  let id = (url.match(/\/?id=(.+)/i) || url.match(/\/d\/(.*?)\//))[1]

  let { data } = await axios.post(`https://drive.google.com/uc?id=${id}&authuser=0&export=download`, null, {
    headers: {
      'accept-encoding': 'gzip, deflate, br',
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'origin': 'https://drive.google.com',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3325.181 Safari/537.36',
      'x-client-data': 'CKG1yQEIkbbJAQiitskBCMS2yQEIqZ3KAQioo8oBGLeYygE=',
      'x-drive-first-party': 'DriveWebUi',
      'x-json-requested': 'true'
    }
  })

  let { fileName, sizeBytes, downloadUrl } = JSON.parse(data.slice(4))

  return {
    download: downloadUrl,
    fileName,
    fileSize: `${(sizeBytes / (1024 * 1024)).toFixed(2)} MB`,
    mimetype: (await axios.head(downloadUrl)).headers['content-type'],
    extension: fileName.split('.').pop(),
    modified: (await axios.head(downloadUrl)).headers['last-modified']
  }
}

const acr = new acrcloud({
  host: "identify-eu-west-1.acrcloud.com",
  access_key: "c9f2fca5e16a7986b0a6c8ff70ed0a06",
  access_secret: "PQR9E04ZD60wQPgTSRRqwkBFIWEZldj0G3q7NJuR"
})

async function whatmusic(input) {
  try {
    let file_path = './sampah.mp3'

    if (Buffer.isBuffer(input)) {
      fs.writeFileSync(file_path, input)
    } else if (typeof input === 'string') {
      if (/^https?:\/\//.test(input)) {
        let response = await axios.get(input, { responseType: 'arraybuffer' })
        fs.writeFileSync(file_path, Buffer.from(response.data))
      } else if (fs.existsSync(input)) {
        file_path = input
      }
    } else {
      throw Error('Harus berupa URL, file atau buffer!')
    }

    let outputna = './hasilnya.mp3'

    return new Promise((resolve, reject) => {
      ffmpeg(file_path)
        .audioCodec('libmp3lame')
        .saveToFile(outputna)
        .on('error', (err) => {
          fs.unlinkSync(file_path)
          reject(err.message)
        })
        .on('end', async () => {
          fs.unlinkSync(file_path)
          let sample = fs.readFileSync(outputna)

          acr.identify(sample).then((metadata) => {
            fs.unlinkSync(outputna)
            if (metadata.status.msg === 'No result') {
              return reject('Nggak ketemu :(')
            }

            let song = metadata.metadata.music[0]
            let spotify_data = song.external_metadata?.spotify
            let youtube_id = song.external_metadata?.youtube?.vid || null

            resolve({
              title: song.title,
              artists: song.artists.map(a => a.name).join(', '),
              album: song.album.name,
              release_date: song.release_date,
              label: song.label,
              duration: song.duration_ms,
              spotify: spotify_data?.track?.id ? { name: song.title, url: `https://open.spotify.com/track/${spotify_data.track.id}` } : null,
              youtube: youtube_id ? `https://www.youtube.com/watch?v=${youtube_id}` : null
            })
          }).catch((err) => reject(err.message))
        })
    })
  } catch (err) {
    throw Error(err.message)
  }
}

async function recolor(filePath) {
  return new Promise((resolve, reject) => {
    const outputPath = './lib/recolor_output.jpg'
    const cmd = `ffmpeg -y -loglevel error -i ${filePath} -vf "curves=r='0/0 0.5/0.6 1/1':g='0/0 0.5/0.55 1/1':b='0/0 0.5/0.65 1/1'" ${outputPath}`
    exec(cmd, (err) => {
      if (err) return reject(new Error(`Terjadi kesalahan: ${err.message}`))
      resolve(outputPath)
    })
  })
}

async function dehaze(filePath) {
  return new Promise((resolve, reject) => {
    const outputPath = './lib/dehaze_output.jpg'
    const cmd = `ffmpeg -i ${filePath} -vf "colorchannelmixer=rr=0.75:gg=0.65:bb=0.5, eq=contrast=0.75:saturation=0.4:brightness=-0.15, gblur=sigma=1.2" ${outputPath}`
    exec(cmd, (err) => {
      if (err) return reject(new Error(`Terjadi kesalahan: ${err}`))
      resolve(outputPath)
    })
  })
}

module.exports = { catbox, uguu, theoks, litterbox, cloudmini, tempfiles, ytdlv1, ytdlv2, fbdl, igdl, ttdl, ttslide, spotify, capcut, threads, terabox, gdrive, whatmusic, recolor, dehaze }