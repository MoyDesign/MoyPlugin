/*
Copyright (c) 2018 Dmitry Savenko <ds@dsavenko.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/

'use strict'

const PARSERS_URI = 'https://api.github.com/repos/MoyDesign/MoyData/contents/MoyParsers'

async function fetchParser(githubFileInfo) {
    const resp = await fetch(githubFileInfo.download_url)
    const text = await resp.text()
    return new MoyParser({content: jsyaml.safeLoad(text)})
}

async function fetchParsers() {
    const resp = await fetch(PARSERS_URI)
    const dir = await resp.json()
    const parsers = await Promise.all(dir.map(fetchParser))
    return new Map(parsers.map(p => [p.name, p]))
}

fetchParsers()
    .then(parsers => console.log('parsers', parsers))
    .catch(e => console.log('error', e))
