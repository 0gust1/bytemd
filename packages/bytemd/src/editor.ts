import type { Editor, Position } from 'codemirror';
import type CodeMirror from 'codemirror';
import type {
  BytemdPlugin,
  BytemdAction,
  EditorProps,
  BytemdLocale,
} from './types';
import { icons } from './icons';
import selectFiles from 'select-files';

export type EditorUtils = ReturnType<typeof createEditorUtils>;

export function createEditorUtils(
  codemirror: typeof CodeMirror,
  editor: Editor
) {
  return {
    /**
     * Wrap text with decorators, for example:
     *
     * `text -> *text*`
     */
    wrapText(before: string, after = before) {
      const range = editor.somethingSelected()
        ? editor.listSelections()[0] // only handle the first selection
        : editor.findWordAt(editor.getCursor());

      const from = range.from(); // use from/to instead of anchor/head for reverse select
      const to = range.to();
      const text = editor.getRange(from, to);
      const fromBefore = codemirror.Pos(from.line, from.ch - before.length);
      const toAfter = codemirror.Pos(to.line, to.ch + after.length);

      if (
        editor.getRange(fromBefore, from) === before &&
        editor.getRange(to, toAfter) === after
      ) {
        editor.replaceRange(text, fromBefore, toAfter);
        editor.setSelection(
          fromBefore,
          codemirror.Pos(fromBefore.line, fromBefore.ch + text.length)
        );
      } else {
        editor.replaceRange(before + text + after, from, to);

        // select the original text
        const cursor = editor.getCursor();
        editor.setSelection(
          codemirror.Pos(cursor.line, cursor.ch - after.length - text.length),
          codemirror.Pos(cursor.line, cursor.ch - after.length)
        );
      }
    },
    /**
     * replace multiple lines
     *
     * `line -> # line`
     */
    replaceLines(replace: Parameters<Array<string>['map']>[0]) {
      const [selection] = editor.listSelections();

      const range = [
        codemirror.Pos(selection.from().line, 0),
        codemirror.Pos(selection.to().line),
      ] as const;
      const lines = editor.getRange(...range).split('\n');
      editor.replaceRange(lines.map(replace).join('\n'), ...range);
      editor.setSelection(...range);
    },
    /**
     * Append a block based on the cursor position
     */
    appendBlock(content: string): Position {
      const cursor = editor.getCursor();
      // find the first blank line

      let emptyLine = -1;
      for (let i = cursor.line; i < editor.lineCount(); i++) {
        if (!editor.getLine(i).trim()) {
          emptyLine = i;
          break;
        }
      }
      if (emptyLine === -1) {
        // insert a new line to the bottom
        editor.replaceRange('\n', codemirror.Pos(editor.lineCount()));
        emptyLine = editor.lineCount();
      }

      editor.replaceRange('\n' + content, codemirror.Pos(emptyLine));
      return codemirror.Pos(emptyLine + 1, 0);
    },
    /**
     * Triggers a virtual file input and let user select files
     *
     * https://www.npmjs.com/package/select-files
     */
    selectFiles,
  };
}

export function findStartIndex(num: number, nums: number[]) {
  let startIndex = nums.length - 2;
  for (let i = 0; i < nums.length; i++) {
    if (num < nums[i]) {
      startIndex = i - 1;
      break;
    }
  }
  startIndex = Math.max(startIndex, 0); // ensure >= 0
  return startIndex;
}

const getShortcutWithPrefix = (key: string, shift = false) => {
  const shiftPrefix = shift ? 'Shift-' : '';
  const CmdPrefix =
    typeof navigator !== 'undefined' && /Mac/.test(navigator.platform)
      ? 'Cmd-'
      : 'Ctrl-';
  return shiftPrefix + CmdPrefix + key;
};

export function getBuiltinActions(
  locale: BytemdLocale,
  plugins: BytemdPlugin[],
  uploadImages: EditorProps['uploadImages']
): BytemdAction[] {
  const items: BytemdAction[] = [
    {
      icon: icons.heading,
      handler: {
        type: 'dropdown',
        actions: [1, 2, 3, 4, 5, 6].map((level) => ({
          title: locale.action[`h${level}` as keyof typeof locale.action],
          icon: icons[`h${level}` as keyof typeof icons],
          cheatsheet:
            level <= 3
              ? `${'#'.repeat(level)} ${locale.action.headingText}`
              : undefined,
          handler: {
            type: 'action',
            click({ replaceLines, editor }) {
              replaceLines((line) => {
                line = line.trim().replace(/^#*/, '').trim();
                line = '#'.repeat(level) + ' ' + line;
                return line;
              });
              editor.focus();
            },
          },
        })),
      },
    },
    {
      title: locale.action.bold,
      icon: icons.bold,
      cheatsheet: `**${locale.action.boldText}**`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('B'),
        click({ wrapText, editor }) {
          wrapText('**');
          editor.focus();
        },
      },
    },
    {
      title: locale.action.italic,
      icon: icons.italic,
      cheatsheet: `*${locale.action.italicText}*`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('I'),
        click({ wrapText, editor }) {
          wrapText('*');
          editor.focus();
        },
      },
    },
    {
      title: locale.action.quote,
      icon: icons.quote,
      cheatsheet: `> ${locale.action.quotedText}`,
      handler: {
        type: 'action',
        click({ replaceLines, editor }) {
          replaceLines((line) => '> ' + line);
          editor.focus();
        },
      },
    },
    {
      title: locale.action.link,
      icon: icons.link,
      cheatsheet: `[${locale.action.linkText}](url)`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('K'),
        click({ editor, wrapText, codemirror }) {
          wrapText('[', '](url)');
          const cursor = editor.getCursor();
          editor.setSelection(
            codemirror.Pos(cursor.line, cursor.ch + 2),
            codemirror.Pos(cursor.line, cursor.ch + 5)
          );
          editor.focus();
        },
      },
    },
    {
      title: locale.action.image,
      icon: icons.image,
      cheatsheet: `![${locale.action.imageAlt}](url "${locale.action.imageTitle}")`,
      handler: uploadImages
        ? {
            type: 'action',
            shortcut: getShortcutWithPrefix('I', true),
            async click({ appendBlock, selectFiles, editor, codemirror }) {
              const fileList = await selectFiles({
                accept: 'image/*',
                multiple: true,
              });
              const files = Array.from(fileList ?? []);
              const imgs = await uploadImages(files);
              const pos = appendBlock(
                imgs
                  .map(({ url, alt, title }, i) => {
                    alt = alt ?? files[i].name;
                    return `![${alt}](${url}${title ? ` "${title}"` : ''})`;
                  })
                  .join('\n\n')
              );
              editor.setSelection(
                pos,
                codemirror.Pos(pos.line + imgs.length * 2 - 2)
              );
              editor.focus();
            },
          }
        : undefined,
    },
    {
      title: locale.action.code,
      icon: icons.code,
      cheatsheet: '`' + locale.action.codeText + '`',
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('K', true),
        click({ wrapText, editor }) {
          wrapText('`');
          editor.focus();
        },
      },
    },
    {
      title: locale.action.codeBlock,
      icon: icons.codeBlock,
      cheatsheet: '```' + locale.action.codeLang + '↵',
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('C', true),
        click({ editor, appendBlock, codemirror }) {
          const pos = appendBlock('```js\n```');
          editor.setSelection(
            codemirror.Pos(pos.line, 3),
            codemirror.Pos(pos.line, 5)
          );
          editor.focus();
        },
      },
    },
    {
      title: locale.action.ul,
      icon: icons.ul,
      cheatsheet: `- ${locale.action.ulItem}`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('U', true),
        click({ replaceLines, editor }) {
          replaceLines((line) => '- ' + line);
          editor.focus();
        },
      },
    },
    {
      title: locale.action.ol,
      icon: icons.ol,
      cheatsheet: `1. ${locale.action.olItem}`,
      handler: {
        type: 'action',
        shortcut: getShortcutWithPrefix('O', true),
        click({ replaceLines, editor }) {
          replaceLines((line, i) => `${i + 1}. ${line}`);
          editor.focus();
        },
      },
    },
    {
      title: locale.action.hr,
      icon: icons.hr,
      cheatsheet: '---',
    },
  ];

  plugins.forEach(({ actions }) => {
    if (actions) items.push(...actions);
  });
  return items;
}
