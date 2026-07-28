#!/usr/bin/env node
// Notion read/write CLI for the notion-task-sync skill.
// All matching/analysis judgment lives in the skill instructions (Claude decides what to
// call this script with) — this file only talks to the Notion API.
//
// Two directions this supports:
//   - code -> 개발 Task/TodoList status (list/create-task/create-todo/update-todo, --epic 개발)
//   - 기획 문서(GDD 등) 내용 조회/수정 (list --epic 기획, doc-blocks, update-text-block,
//     update-table-row, append-block, append-table-row, delete-block) so both
//     "기획 변경 -> 코드 반영" (gdd-pull-sync) and "코드 변경 -> 기획 문서 반영" (gdd-push-sync)
//     can run through the same primitives.

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../../..');

// Fixed project structure discovered for Project_MAOU's Notion workspace.
// These are not secrets — only the integration token is (see .env).
const TASKS_DB_ID = '1a12ca92-c5bc-83f9-8174-01ec07f6d16d'; // "Tasks" DB
const TODOLIST_DB_ID = '84a2ca92-c5bc-8281-b824-811af003cded'; // "TodoList" DB
const EPICS = {
  개발: '3a82ca92-c5bc-8084-ba54-cd9f108df4d0',
  기획: '3a82ca92-c5bc-8079-9fef-d3027477b855',
};
const STATUS_VALUES = ['시작 전', '진행 중', '완료'];
const MAX_BLOCK_DEPTH = 4;

function loadEnvToken() {
  const envPath = path.join(REPO_ROOT, '.env');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (key && !(key in process.env)) process.env[key] = value;
    }
  }
  const token = process.env.NOTION_TOKEN;
  if (!token) {
    console.error(
      [
        'NOTION_TOKEN이 설정되어 있지 않습니다.',
        `1) 프로젝트 루트(${REPO_ROOT})에 .env 파일을 만드세요 (.env.example 참고).`,
        '2) NOTION_TOKEN=발급받은_토큰 을 한 줄 추가하세요.',
        '토큰은 팀 내부에서 개별 공유됩니다 — 이 저장소에 커밋하지 마세요.',
      ].join('\n'),
    );
    process.exit(1);
  }
  return token;
}

const TOKEN = loadEnvToken();
const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Notion-Version': '2022-06-28',
  'Content-Type': 'application/json',
};

async function notion(method, urlPath, body) {
  const res = await fetch(`https://api.notion.com/v1${urlPath}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Notion API ${method} ${urlPath} -> ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

const richText = (s) => [{ type: 'text', text: { content: s } }];
const plainTitle = (prop) => (prop?.title || []).map((t) => t.plain_text).join('');

function blockText(block) {
  if (block.type === 'table_row') {
    return block.table_row.cells.map((c) => c.map((t) => t.plain_text).join('')).join(' | ');
  }
  const rt = block[block.type]?.rich_text;
  return rt ? rt.map((t) => t.plain_text).join('') : '';
}

function resolveEpic(name) {
  const epic = name || '개발';
  if (!EPICS[epic]) throw new Error(`알 수 없는 epic "${epic}". 사용 가능: ${Object.keys(EPICS).join(', ')}`);
  return { name: epic, id: EPICS[epic] };
}

function parseFlags(args) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      flags[args[i].slice(2)] = args[i + 1];
      i++;
    } else {
      rest.push(args[i]);
    }
  }
  return { flags, rest };
}

async function queryAll(dbId, filter) {
  const results = [];
  let cursor;
  do {
    const body = { page_size: 100, ...(filter ? { filter } : {}), ...(cursor ? { start_cursor: cursor } : {}) };
    const page = await notion('POST', `/databases/${dbId}/query`, body);
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return results;
}

async function getAllChildren(blockId) {
  const results = [];
  let cursor;
  do {
    const qs = cursor ? `?page_size=100&start_cursor=${cursor}` : '?page_size=100';
    const page = await notion('GET', `/blocks/${blockId}/children${qs}`);
    results.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor);
  return results;
}

// --- list: 개발이면 Task+TodoList 상태, 그 외 epic이면 Task+상위 블록 미리보기 ---
async function cmdList(epicName) {
  const epic = resolveEpic(epicName);
  const tasks = await queryAll(TASKS_DB_ID, {
    property: 'ProjectsDB',
    relation: { contains: epic.id },
  });

  const out = [];
  for (const task of tasks) {
    const entry = {
      taskId: task.id,
      title: plainTitle(task.properties.Task),
      status: task.properties.TaskStatus?.formula?.string ?? null,
      progress: task.properties.TaskProgress?.rollup?.number ?? null,
    };
    if (epic.name === '개발') {
      const todos = await queryAll(TODOLIST_DB_ID, {
        property: 'TasksDB',
        relation: { contains: task.id },
      });
      entry.todos = todos.map((t) => ({
        todoId: t.id,
        title: plainTitle(t.properties.Todo),
        status: t.properties.Status?.status?.name ?? null,
        complete: t.properties.Complete?.checkbox ?? false,
      }));
    } else {
      const children = await getAllChildren(task.id);
      entry.blocksPreview = children
        .filter((b) => blockText(b).trim())
        .slice(0, 20)
        .map((b) => ({ id: b.id, type: b.type, text: blockText(b).slice(0, 120) }));
      entry.note = '문서 페이지입니다. 전체 내용은 doc-blocks 명령으로 재귀 조회하세요.';
    }
    out.push(entry);
  }
  console.log(JSON.stringify(out, null, 2));
}

async function cmdCreateTask(title, epicName) {
  if (!title) throw new Error('사용법: create-task "<제목>" [--epic 개발|기획]');
  const epic = resolveEpic(epicName);
  const page = await notion('POST', '/pages', {
    parent: { database_id: TASKS_DB_ID },
    properties: {
      Task: { title: richText(title) },
      ProjectsDB: { relation: [{ id: epic.id }] },
    },
  });
  console.log(JSON.stringify({ taskId: page.id, title, epic: epic.name }, null, 2));
}

async function cmdCreateTodo(taskId, title, status) {
  if (!taskId || !title || !status) throw new Error('사용법: create-todo <taskId> "<제목>" <시작 전|진행 중|완료>');
  if (!STATUS_VALUES.includes(status)) throw new Error(`status는 다음 중 하나여야 합니다: ${STATUS_VALUES.join(', ')}`);
  const page = await notion('POST', '/pages', {
    parent: { database_id: TODOLIST_DB_ID },
    properties: {
      Todo: { title: richText(title) },
      TasksDB: { relation: [{ id: taskId }] },
      Status: { status: { name: status } },
      Complete: { checkbox: status === '완료' },
    },
  });
  console.log(JSON.stringify({ todoId: page.id, title, status }, null, 2));
}

async function cmdUpdateTodo(todoId, status) {
  if (!todoId || !status) throw new Error('사용법: update-todo <todoId> <시작 전|진행 중|완료>');
  if (!STATUS_VALUES.includes(status)) throw new Error(`status는 다음 중 하나여야 합니다: ${STATUS_VALUES.join(', ')}`);
  const page = await notion('PATCH', `/pages/${todoId}`, {
    properties: {
      Status: { status: { name: status } },
      Complete: { checkbox: status === '완료' },
    },
  });
  console.log(JSON.stringify({ todoId: page.id, status }, null, 2));
}

// --- 문서(기획) 쪽 읽기/쓰기 ---

async function cmdDocBlocks(pageId, depth = 0, prefix = '') {
  if (!pageId) throw new Error('사용법: doc-blocks <pageId>');
  if (depth === 0) console.log(`# blocks under ${pageId}`);
  if (depth > MAX_BLOCK_DEPTH) return;
  const children = await getAllChildren(pageId);
  for (const b of children) {
    const text = blockText(b);
    console.log(`${prefix}${b.id} | ${b.type}${text ? ' | ' + text.slice(0, 150) : ''}`);
    if (b.has_children && b.type !== 'child_page') {
      await cmdDocBlocks(b.id, depth + 1, prefix + '  ');
    }
  }
}

const TEXT_BLOCK_TYPES = [
  'paragraph',
  'heading_1',
  'heading_2',
  'heading_3',
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
  'quote',
  'callout',
];

async function cmdUpdateTextBlock(blockId, text) {
  if (!blockId || text === undefined) throw new Error('사용법: update-text-block <blockId> "<새 텍스트>"');
  const block = await notion('GET', `/blocks/${blockId}`);
  if (!TEXT_BLOCK_TYPES.includes(block.type)) {
    throw new Error(`update-text-block은 텍스트 블록(${TEXT_BLOCK_TYPES.join(', ')})만 지원합니다. 실제 타입: ${block.type}`);
  }
  const payload = { [block.type]: { rich_text: richText(text) } };
  await notion('PATCH', `/blocks/${blockId}`, payload);
  console.log(JSON.stringify({ blockId, type: block.type, text }, null, 2));
}

async function cmdUpdateTableRow(rowBlockId, cellsArg) {
  if (!rowBlockId || !cellsArg) throw new Error('사용법: update-table-row <rowBlockId> "<셀1>|<셀2>|..."');
  const cells = cellsArg.split('|');
  await notion('PATCH', `/blocks/${rowBlockId}`, {
    table_row: { cells: cells.map((c) => richText(c)) },
  });
  console.log(JSON.stringify({ rowBlockId, cells }, null, 2));
}

// 표는 생성 시점에 table_width가 고정되고, 최초 행들을 같은 요청의 children으로 넣어야 한다
// (row 개수 0으로 만든 뒤 나중에 append-table-row로 채우는 것도 되지만, 헤더는 처음부터 있는 게 자연스럽다).
async function cmdCreateTable(parentId, colCount, rows, after) {
  const width = Number(colCount);
  if (!parentId || !width || !rows.length) {
    throw new Error('사용법: create-table <parentBlockId> <colCount> "<셀1>|<셀2>" ["<셀1>|<셀2>" ...] [--after <id>]');
  }
  const children = rows.map((r) => ({
    object: 'block',
    type: 'table_row',
    table_row: { cells: r.split('|').map((c) => richText(c)) },
  }));
  const table = {
    object: 'block',
    type: 'table',
    table: { table_width: width, has_column_header: true, has_row_header: false, children },
  };
  const body = { children: [table], ...(after ? { after } : {}) };
  const res = await notion('PATCH', `/blocks/${parentId}/children`, body);
  const created = res.results[0];
  console.log(JSON.stringify({ tableBlockId: created.id, width, rows: rows.length, after: after ?? null }, null, 2));
}

async function cmdAppendBlock(parentId, type, text, after) {
  if (!parentId || !type || text === undefined) {
    throw new Error('사용법: append-block <parentBlockId> <type> "<텍스트>" [--after <siblingBlockId>]');
  }
  if (!TEXT_BLOCK_TYPES.includes(type)) {
    throw new Error(`append-block은 텍스트 블록(${TEXT_BLOCK_TYPES.join(', ')})만 지원합니다.`);
  }
  const child = { object: 'block', type, [type]: { rich_text: richText(text) } };
  const body = { children: [child], ...(after ? { after } : {}) };
  const res = await notion('PATCH', `/blocks/${parentId}/children`, body);
  const created = res.results[0];
  console.log(JSON.stringify({ blockId: created.id, type, text, after: after ?? null }, null, 2));
}

async function cmdAppendTableRow(tableBlockId, cellsArg, after) {
  if (!tableBlockId || !cellsArg) throw new Error('사용법: append-table-row <tableBlockId> "<셀1>|<셀2>|..." [--after <siblingRowBlockId>]');
  const cells = cellsArg.split('|');
  const child = { object: 'block', type: 'table_row', table_row: { cells: cells.map((c) => richText(c)) } };
  const body = { children: [child], ...(after ? { after } : {}) };
  const res = await notion('PATCH', `/blocks/${tableBlockId}/children`, body);
  const created = res.results[0];
  console.log(JSON.stringify({ rowBlockId: created.id, cells, after: after ?? null }, null, 2));
}

async function cmdDeleteBlock(blockId) {
  if (!blockId) throw new Error('사용법: delete-block <blockId>');
  await notion('DELETE', `/blocks/${blockId}`);
  console.log(JSON.stringify({ deleted: blockId }, null, 2));
}

async function cmdPageMeta(pageId) {
  if (!pageId) throw new Error('사용법: page-meta <pageId>');
  const page = await notion('GET', `/pages/${pageId}`);
  console.log(
    JSON.stringify(
      { pageId: page.id, lastEditedTime: page.last_edited_time, url: page.url },
      null,
      2,
    ),
  );
}

const [, , cmd, ...rawArgs] = process.argv;
const { flags, rest } = parseFlags(rawArgs);

try {
  switch (cmd) {
    case 'list':
      await cmdList(flags.epic);
      break;
    case 'create-task':
      await cmdCreateTask(rest[0], flags.epic);
      break;
    case 'create-todo':
      await cmdCreateTodo(rest[0], rest[1], rest[2]);
      break;
    case 'update-todo':
      await cmdUpdateTodo(rest[0], rest[1]);
      break;
    case 'doc-blocks':
      await cmdDocBlocks(rest[0]);
      break;
    case 'update-text-block':
      await cmdUpdateTextBlock(rest[0], rest[1]);
      break;
    case 'update-table-row':
      await cmdUpdateTableRow(rest[0], rest[1]);
      break;
    case 'create-table':
      await cmdCreateTable(rest[0], rest[1], rest.slice(2), flags.after);
      break;
    case 'append-block':
      await cmdAppendBlock(rest[0], rest[1], rest[2], flags.after);
      break;
    case 'append-table-row':
      await cmdAppendTableRow(rest[0], rest[1], flags.after);
      break;
    case 'delete-block':
      await cmdDeleteBlock(rest[0]);
      break;
    case 'page-meta':
      await cmdPageMeta(rest[0]);
      break;
    default:
      console.error(
        [
          '사용법:',
          '  node sync.mjs list [--epic 개발|기획]',
          '  node sync.mjs create-task "<제목>" [--epic 개발|기획]',
          '  node sync.mjs create-todo <taskId> "<제목>" <시작 전|진행 중|완료>',
          '  node sync.mjs update-todo <todoId> <시작 전|진행 중|완료>',
          '  node sync.mjs doc-blocks <pageId>                         # 문서 페이지 전체 블록을 id와 함께 덤프',
          '  node sync.mjs update-text-block <blockId> "<텍스트>"       # 문단/글머리표/헤딩 텍스트 교체',
          '  node sync.mjs update-table-row <rowBlockId> "<셀1>|<셀2>"  # 표의 한 행 교체',
          '  node sync.mjs create-table <parentId> <colCount> "<셀1>|<셀2>" ["<셀1>|<셀2>" ...] [--after <id>]  # 새 표 생성 (첫 행=헤더)',
          '  node sync.mjs append-block <parentId> <type> "<텍스트>" [--after <id>]    # 새 텍스트 블록 추가 (문단/헤딩/리스트 등). --after로 특정 블록 바로 뒤에 삽입',
          '  node sync.mjs append-table-row <tableBlockId> "<셀1>|<셀2>" [--after <id>] # 표에 새 행 추가',
          '  node sync.mjs delete-block <blockId>                      # 블록(표 행 등) 삭제',
          '  node sync.mjs page-meta <pageId>                          # 페이지 최종 수정 시각 조회 (변경 감지용)',
        ].join('\n'),
      );
      process.exit(1);
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
