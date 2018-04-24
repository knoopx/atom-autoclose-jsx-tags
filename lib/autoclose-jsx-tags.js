'use babel'

import { CompositeDisposable } from 'atom'

const TAG_START_REGEX = /(<)([a-zA-Z0-9.:$_]+)/g
const TAG_END_REGEX = /(<\/)([^>]+)(>)/g

function onCloseOpeningTag(editor, { newRange }) {
  // auto closing multiple cursors is a little bit tricky so lets disable it for now
  if (editor.getCursorBufferPositions().length > 1) {
    return
  }

  const tokenizedLine = editor.tokenizedBuffer.tokenizedLineForRow(
    newRange.end.row,
  )

  if (tokenizedLine == null) {
    return
  }

  const token = tokenizedLine.tokenAtBufferColumn(newRange.end.column - 1)

  if (token == null || token.scopes.indexOf('JSXStartTagEnd') === -1) {
    return
  }

  const lines = editor.buffer.getLines()
  let { row } = newRange.end
  let line = lines[row]
  line = line.substr(0, newRange.end.column)
  // Tag is self closing
  if (line.substr(line.length - 2, 1) === '/') {
    return
  }
  let tagName = null
  while (line != null && tagName == null) {
    const match = line.match(TAG_START_REGEX)
    if (match != null && match.length > 0) {
      tagName = match.pop().substr(1)
    }
    row--
    line = lines[row]
  }
  if (tagName != null) {
    editor.insertText(`</${tagName}>`, { undo: 'skip' })
    editor.setCursorBufferPosition(newRange.end)
  }
}

function onRemoveOpeningTag(editor, { newRange }) {
  const lines = editor.buffer.getLines()
  let { row } = newRange.end
  const fullLine = lines[row]
  const tokenizedLine = editor.tokenizedBuffer.tokenizedLineForRow(
    newRange.end.row,
  )
  if (tokenizedLine == null) {
    return
  }
  const token = tokenizedLine.tokenAtBufferColumn(newRange.end.column - 1)
  if (token == null || token.scopes.indexOf('JSXStartTagEnd') === -1) {
    return
  }
  let line = fullLine.substr(0, newRange.end.column)
  // Tag is self closing
  if (line.substr(line.length - 1, 1) === '/') {
    return
  }
  let tagName = null
  while (line != null && tagName == null) {
    const match = line.match(TAG_START_REGEX)
    if (match != null && match.length > 0) {
      tagName = match.pop().substr(1)
    }
    row--
    line = lines[row]
  }
  if (tagName != null) {
    const rest = fullLine.substr(newRange.end.column)
    if (rest.indexOf(`</${tagName}>`) === 0) {
      // rest is closing tag
      const serializedEndPoint = [newRange.end.row, newRange.end.column]
      editor.setTextInBufferRange(
        [
          serializedEndPoint,
          [serializedEndPoint[0], serializedEndPoint[1] + tagName.length + 3],
        ],
        '',
        { undo: 'skip' },
      )
    }
  }
}

function onNewLine(editor, { newRange }) {
  const lines = editor.buffer.getLines()
  let { row } = newRange.end
  let lastLine = lines[row - 1]
  const fullLine = lines[row]
  if (/>$/.test(lastLine) && fullLine.search(TAG_END_REGEX) === 0) {
    while (lastLine != null) {
      const match = lastLine.match(TAG_START_REGEX)
      if (match != null && match.length > 0) {
        break
      }
      row--
      lastLine = lines[row]
    }
    let lastLineSpaces = lastLine.match(/^\s*/)
    lastLineSpaces = lastLineSpaces != null ? lastLineSpaces[0] : ''
    editor.insertText(`\n${lastLineSpaces}`)
    editor.setCursorBufferPosition(newRange.end)
  }
}

export default {
  onActiveTextEditor: null,
  onDidChangeBuffer: null,

  activate(state) {
    this.onActiveTextEditor = atom.workspace.observeActiveTextEditor(
      (editor) => {
        if (this.onDidChangeBuffer) {
          this.onDidChangeBuffer.dispose()
        }

        if (editor && editor.tokenizedBuffer) {
          const { scopeName } = editor.getGrammar()
          if (['source.js.jsx', 'source.coffee.jsx'].includes(scopeName)) {
            this.onDidChangeBuffer = editor.buffer.onDidChange((e) => {
              if (e.newText === '>' && !e.oldText) {
                onCloseOpeningTag(editor, e)
              } else if (e.oldText === '>' && e.newText === '') {
                onRemoveOpeningTag(editor, e)
              } else if (e.newText.match(/\r?\n/)) {
                onNewLine(editor, e)
              }
            })
          }
        }
      },
    )
  },

  deactivate() {
    this.onActiveTextEditor.dispose()
    if (this.onDidChangeBuffer) {
      this.onDidChangeBuffer.dispose()
    }
  },
}
