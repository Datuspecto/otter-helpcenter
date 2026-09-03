-- 오터 헬프센터 스키마
DROP TABLE IF EXISTS article_revisions;
DROP TABLE IF EXISTS articles;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS assets;

CREATE TABLE categories (
  key         TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  thumb_url   TEXT,
  hero_url    TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  slug         TEXT NOT NULL,
  category     TEXT NOT NULL REFERENCES categories(key),
  type         TEXT NOT NULL DEFAULT 'article',   -- article | notice
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',
  body_md      TEXT NOT NULL DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'draft',     -- draft | published
  env          TEXT NOT NULL DEFAULT 'all',       -- all|windows|chrome|app|bizmanager
  audience     TEXT NOT NULL DEFAULT 'owner',     -- owner | hq
  tags         TEXT NOT NULL DEFAULT '',
  thumb        TEXT,                              -- 비우면 카테고리 배너 사용
  sort_order   INTEGER NOT NULL DEFAULT 99,
  view_count   INTEGER NOT NULL DEFAULT 0,
  published_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (category, slug)
);
CREATE INDEX idx_articles_status ON articles(status);
CREATE INDEX idx_articles_cat ON articles(category, sort_order);

CREATE TABLE article_revisions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  summary    TEXT NOT NULL DEFAULT '',
  body_md    TEXT NOT NULL,
  author     TEXT NOT NULL DEFAULT 'human',       -- human | api
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rev_article ON article_revisions(article_id, created_at DESC);

CREATE TABLE assets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,                -- R2 오브젝트 키
  filename   TEXT,
  mime       TEXT,
  bytes      INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
