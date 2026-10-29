// Intentionally empty by default.
// Add Drizzle tables here when the site actually needs a database.
// See examples/d1/db/schema.ts for an opt-in example.
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
export const workspaces=sqliteTable('learning_workspaces', {
  userId:text('user_id').primaryKey(),
  revision:integer('revision').notNull().default(0),
  snapshot:text('snapshot').notNull().default('{}'),
  updatedAt:integer('updated_at').notNull().default(0),
});
export const files=sqliteTable('learning_files', {
  key:text('key').primaryKey(),userId:text('user_id').notNull(),
  fileId:text('file_id').notNull(),type:text('type').notNull(),
  size:integer('size').notNull(),digest:text('digest').notNull(),
  createdAt:integer('created_at').notNull(),
  quarkFid:text('quark_fid'),archivedAt:integer('archived_at'),archiveLockedUntil:integer('archive_locked_until').notNull().default(0),
},table=>[index('learning_files_user_idx').on(table.userId)]);
export const quarkAuth=sqliteTable('learning_quark_auth',{id:text('id').primaryKey(),value:text('value').notNull(),lockedUntil:integer('locked_until').notNull().default(0)});
export const quarkFolders=sqliteTable('learning_quark_folders',{id:text('id').primaryKey(),fid:text('fid').notNull()});
export const quarkNotes=sqliteTable('learning_quark_notes',{id:text('id').primaryKey(),digest:text('digest').notNull(),fid:text('fid').notNull(),lockedUntil:integer('locked_until').notNull().default(0)});
export const aiRequests=sqliteTable('learning_ai_requests',{
 id:text('id').primaryKey(),userId:text('user_id').notNull(),conversationId:text('conversation_id').notNull(),messageId:text('message_id').notNull(),
 status:text('status').notNull(),output:text('output').notNull().default(''),model:text('model').notNull(),createdAt:integer('created_at').notNull(),
});
