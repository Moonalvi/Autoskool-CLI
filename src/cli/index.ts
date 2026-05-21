#!/usr/bin/env node

import { Command } from "commander";

import { getAuthStatus, loginWithDedicatedBrowser, logout, readAuthSession } from "../auth/index.js";
import { formatCommunityFeed, formatCommunityInfo, formatJoinedCommunityList } from "../community/format.js";
import { getCommunityFeed, getCommunityInfo, listJoinedCommunities } from "../community/index.js";
import { createAgentContext } from "../core/agent-context.js";
import { loadConfig } from "../core/config.js";
import { createDoctorReport, formatDoctorReport } from "../core/doctor.js";
import { AutoskoolError, getExitCode } from "../core/errors.js";
import { writeOutput } from "../core/output.js";
import { getStatePaths } from "../core/paths.js";
import { VERSION } from "../core/version.js";
import { startDashboard } from "../dashboard/index.js";
import { getMcpStatus, handleMcpTool, listMcpTools } from "../mcp/index.js";
import { draftComment, queuePostDraft, scorePostOpportunities } from "../posts/index.js";
import { createQueueStore, openQueueDatabase, type QueueStatus } from "../queue/index.js";
import { sendQueueItem } from "../queue/send.js";
import { classifyReplySignal, draftReply, queueReplyDraft } from "../replies/index.js";
import { createBrowserFallback, createSkoolTransport } from "../skool-transport/index.js";

interface GlobalOptions {
  json?: boolean;
}

function getGlobalOptions(command: Command): GlobalOptions {
  return command.optsWithGlobals<GlobalOptions>();
}

async function createAuthedTransport() {
  const config = loadConfig();
  const authSession = await readAuthSession(config);
  if (!authSession) {
    throw new AutoskoolError("AUTH_REQUIRED", "Skool authentication is required. Run `autoskool auth login`.");
  }
  const paths = getStatePaths(config);
  return createSkoolTransport({
    authSession,
    browserFallback: createBrowserFallback({
      browserProfile: paths.browserProfile,
      browserChannel: config.browserChannel,
    }),
  });
}

async function createAuthedBrowserFallback() {
  const config = loadConfig();
  const authSession = await readAuthSession(config);
  if (!authSession) {
    throw new AutoskoolError("AUTH_REQUIRED", "Skool authentication is required. Run `autoskool auth login`.");
  }
  const paths = getStatePaths(config);
  return createBrowserFallback({
    browserProfile: paths.browserProfile,
    browserChannel: config.browserChannel,
  });
}

export function buildProgram(): Command {
  const program = new Command();

  program
    .name("autoskool")
    .description("Safe local Skool automation for humans and AI agents.")
    .version(VERSION, "-v, --version", "Print CLI version")
    .option("--json", "Output machine-readable JSON")
    .showHelpAfterError()
    .showSuggestionAfterError();

  program.command("doctor")
    .alias("check")
    .description("Check local runtime prerequisites")
    .action((_options, command: Command) => {
      const options = getGlobalOptions(command);
      const report = createDoctorReport(loadConfig());
      writeOutput(options.json ? report : formatDoctorReport(report), options);
      if (!report.ok) {
        process.exitCode = 1;
      }
    });

  program.command("agent-context")
    .alias("ctx")
    .description("Emit metadata for AI agents")
    .action((_options, command: Command) => {
      writeOutput(createAgentContext(), { json: true, ...getGlobalOptions(command) });
    });

  program.command("login")
    .description("Shortcut for auth login")
    .option("--timeout-minutes <minutes>", "Minutes to wait for login", "10")
    .option("--community <slug>", "Default community slug to save after login")
    .action(async (options: { timeoutMinutes: string; community?: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const session = await loginWithDedicatedBrowser(loadConfig(), {
        timeoutMinutes: Number(options.timeoutMinutes) || 10,
        community: options.community || "",
      });
      writeOutput(globalOptions.json ? {
        authenticated: true,
        source: session.source,
        savedAt: session.savedAt,
        defaultCommunity: session.defaultCommunity,
        cookieCount: session.cookies.length,
      } : [
        "Skool auth saved from dedicated browser profile.",
        "Automation should remain paused until you explicitly run a workflow.",
        `Default community: ${session.defaultCommunity || "(not set)"}`,
      ].join("\n"), globalOptions);
    });

  program.command("me")
    .description("Shortcut for auth status")
    .action(async (_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const status = await getAuthStatus(loadConfig());
      if (!status.authenticated) {
        writeOutput(globalOptions.json ? status : `Not authenticated. Run \`autoskool login\`.\nAuth file: ${status.authFile}`, globalOptions);
        throw new AutoskoolError("AUTH_REQUIRED", "Skool authentication is required.");
      }
      writeOutput(globalOptions.json ? status : [
        "Authenticated",
        `  Source: ${status.source}`,
        `  Cookies: ${status.cookieCount}`,
        `  Auth token: ${status.authTokenMasked}`,
        `  Default community: ${status.defaultCommunity || "(not set)"}`,
        `  Auth file: ${status.authFile}`,
        `  Browser profile: ${status.browserProfile}`,
      ].join("\n"), globalOptions);
    });

  program.command("logout")
    .description("Shortcut for auth logout")
    .action(async (_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      await logout(loadConfig());
      writeOutput(globalOptions.json ? { authenticated: false, cleared: true } : "Logged out. Local auth session cleared.", globalOptions);
    });

  program.command("communities")
    .alias("groups")
    .description("Shortcut for community list")
    .action(async (_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const result = await listJoinedCommunities(await createAuthedBrowserFallback());
      writeOutput(globalOptions.json ? result : formatJoinedCommunityList(result), globalOptions);
    });

  program.command("info")
    .description("Shortcut for community info")
    .argument("<community>", "Skool community slug")
    .action(async (community: string, _options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const transport = await createAuthedTransport();
      const info = await getCommunityInfo(transport, community);
      writeOutput(globalOptions.json ? info : formatCommunityInfo(info), globalOptions);
    });

  program.command("feed")
    .description("Shortcut for community feed")
    .argument("<community>", "Skool community slug")
    .option("-n, --limit <count>", "Maximum feed items to return", "25")
    .option("-m, --media", "Fetch individual post pages to include full media attachment details")
    .action(async (community: string, options: { limit: string; media?: boolean }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const transport = await createAuthedTransport();
      const feed = await getCommunityFeed(transport, {
        community,
        limit: Number(options.limit) || 25,
        includeMedia: Boolean(options.media),
      });
      writeOutput(globalOptions.json ? feed : formatCommunityFeed(feed), globalOptions);
    });

  const queue = program.command("queue")
    .alias("q")
    .description("Manage the local human approval queue");

  queue.command("list")
    .alias("ls")
    .description("List queue items")
    .option("--status <status>", "Queue status to list", "needs-action")
    .action((options: { status: QueueStatus }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        writeOutput(store.list(options.status), globalOptions);
      } finally {
        store.close();
      }
    });

  queue.command("add-demo")
    .alias("demo")
    .description("Add a local-only demo queue item")
    .action((_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        const item = store.addDemo();
        writeOutput(globalOptions.json ? item : `Added demo queue item: ${item.id}`, globalOptions);
      } finally {
        store.close();
      }
    });

  queue.command("approve")
    .alias("ok")
    .description("Approve a queue item without sending it")
    .argument("<id>", "Queue item ID")
    .action((id: string, _options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        const item = store.approve(id);
        writeOutput(globalOptions.json ? item : `Approved queue item: ${item.id}`, globalOptions);
      } finally {
        store.close();
      }
    });

  queue.command("ignore")
    .alias("no")
    .description("Ignore a queue item without sending it")
    .argument("<id>", "Queue item ID")
    .action((id: string, _options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        const item = store.ignore(id);
        writeOutput(globalOptions.json ? item : `Ignored queue item: ${item.id}`, globalOptions);
      } finally {
        store.close();
      }
    });

  queue.command("send")
    .alias("go")
    .description("Send an approved queue item with final confirmation")
    .argument("<id>", "Queue item ID")
    .option("--confirm", "Confirm this approved item should be sent live")
    .action(async (id: string, options: { confirm?: boolean }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        const item = await sendQueueItem({
          id,
          confirm: Boolean(options.confirm),
          store,
          transport: await createAuthedTransport(),
        });
        writeOutput(globalOptions.json ? item : `Sent queue item: ${item.id}`, globalOptions);
      } finally {
        store.close();
      }
    });

  const safety = program.command("safety")
    .alias("safe")
    .description("Inspect or resume safety pauses");

  safety.command("status")
    .alias("state")
    .description("Show active safety pause")
    .action((_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        const pause = store.getActiveSafetyPause();
        writeOutput(globalOptions.json ? { paused: Boolean(pause), pause } : pause ? `Paused: ${pause.reason}\n${pause.detail}` : "No active safety pause.", globalOptions);
      } finally {
        store.close();
      }
    });

  safety.command("resume")
    .alias("clear")
    .description("Resume after reviewing a safety pause")
    .action((_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        store.resumeSafetyPause();
        writeOutput(globalOptions.json ? { paused: false, resumed: true } : "Safety pause resumed.", globalOptions);
      } finally {
        store.close();
      }
    });

  const auth = program.command("auth")
    .alias("a")
    .description("Manage dedicated Skool browser authentication");

  auth.command("status")
    .alias("me")
    .description("Show local Skool auth status without exposing cookies")
    .action(async (_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const status = await getAuthStatus(loadConfig());
      if (!status.authenticated) {
        writeOutput(globalOptions.json ? status : `Not authenticated. Run \`autoskool auth login\`.\nAuth file: ${status.authFile}`, globalOptions);
        throw new AutoskoolError("AUTH_REQUIRED", "Skool authentication is required.");
      }
      writeOutput(globalOptions.json ? status : [
        "Authenticated",
        `  Source: ${status.source}`,
        `  Cookies: ${status.cookieCount}`,
        `  Auth token: ${status.authTokenMasked}`,
        `  Default community: ${status.defaultCommunity || "(not set)"}`,
        `  Auth file: ${status.authFile}`,
        `  Browser profile: ${status.browserProfile}`,
      ].join("\n"), globalOptions);
    });

  auth.command("logout")
    .alias("out")
    .description("Clear local Skool auth session metadata")
    .action(async (_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      await logout(loadConfig());
      writeOutput(globalOptions.json ? { authenticated: false, cleared: true } : "Logged out. Local auth session cleared.", globalOptions);
    });

  auth.command("login")
    .alias("in")
    .description("Open a dedicated browser profile and wait for Skool login")
    .option("--timeout-minutes <minutes>", "Minutes to wait for login", "10")
    .option("--community <slug>", "Default community slug to save after login")
    .action(async (options: { timeoutMinutes: string; community?: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const session = await loginWithDedicatedBrowser(loadConfig(), {
        timeoutMinutes: Number(options.timeoutMinutes) || 10,
        community: options.community || "",
      });
      writeOutput(globalOptions.json ? {
        authenticated: true,
        source: session.source,
        savedAt: session.savedAt,
        defaultCommunity: session.defaultCommunity,
        cookieCount: session.cookies.length,
      } : [
        "Skool auth saved from dedicated browser profile.",
        "Automation should remain paused until you explicitly run a workflow.",
        `Default community: ${session.defaultCommunity || "(not set)"}`,
      ].join("\n"), globalOptions);
    });

  const community = program.command("community")
    .alias("c")
    .description("Read Skool community data without writing to Skool");

  community.command("list")
    .alias("ls")
    .description("List communities visible to the authenticated Skool account")
    .action(async (_options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const result = await listJoinedCommunities(await createAuthedBrowserFallback());
      writeOutput(globalOptions.json ? result : formatJoinedCommunityList(result), globalOptions);
    });

  community.command("info")
    .alias("i")
    .description("Read community metadata")
    .requiredOption("--community <slug>", "Skool community slug")
    .action(async (options: { community: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const transport = await createAuthedTransport();
      const info = await getCommunityInfo(transport, options.community);
      writeOutput(globalOptions.json ? info : formatCommunityInfo(info), globalOptions);
    });

  community.command("feed")
    .alias("f")
    .description("Read recent community feed items")
    .requiredOption("--community <slug>", "Skool community slug")
    .option("--limit <count>", "Maximum feed items to return", "25")
    .option("--include-media", "Fetch individual post pages to include full media attachment details")
    .action(async (options: { community: string; limit: string; includeMedia?: boolean }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const transport = await createAuthedTransport();
      const feed = await getCommunityFeed(transport, {
        community: options.community,
        limit: Number(options.limit) || 25,
        includeMedia: Boolean(options.includeMedia),
      });
      writeOutput(globalOptions.json ? feed : formatCommunityFeed(feed), globalOptions);
    });

  const posts = program.command("posts")
    .alias("p")
    .description("Find post opportunities and queue comment drafts");

  posts.command("opportunities")
    .alias("hunt")
    .description("Score recent posts for safe comment opportunities")
    .requiredOption("--community <slug>", "Skool community slug")
    .option("--limit <count>", "Maximum feed items to inspect", "25")
    .action(async (options: { community: string; limit: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const feed = await getCommunityFeed(await createAuthedTransport(), {
        community: options.community,
        limit: Number(options.limit) || 25,
      });
      writeOutput(scorePostOpportunities(feed.items), { json: true, ...globalOptions });
    });

  posts.command("draft")
    .alias("write")
    .description("Create a local draft from supplied post context")
    .requiredOption("--post <id>", "Post ID")
    .requiredOption("--title <title>", "Post title")
    .option("--body <text>", "Post body", "")
    .option("--author <name>", "Author name", "Unknown member")
    .action((options: { post: string; title: string; body: string; author: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const opportunity = scorePostOpportunities([{
        id: options.post,
        title: options.title,
        body: options.body,
        authorName: options.author,
        commentCount: 0,
        likeCount: 0,
        sectionId: null,
        sectionName: null,
        attachmentIds: [],
        attachments: [],
        createdAt: null,
        url: null,
      }])[0];
      writeOutput({
        postId: options.post,
        draft: draftComment(opportunity),
        opportunity,
      }, { json: true, ...globalOptions });
    });

  posts.command("queue")
    .alias("save")
    .description("Add a supplied post draft to the local queue")
    .requiredOption("--post <id>", "Post ID")
    .requiredOption("--group <id>", "Skool group ID required for eventual send")
    .requiredOption("--title <title>", "Post title")
    .requiredOption("--draft <text>", "Draft text")
    .option("--url <url>", "Source URL")
    .action((options: { post: string; group: string; title: string; draft: string; url?: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        const item = queuePostDraft(store, {
          postId: options.post,
          title: options.title,
          authorName: "Unknown member",
          score: 0,
          reason: "manual draft",
          sourceUrl: options.url || null,
          evidence: {
            postId: options.post,
            groupId: options.group,
            title: options.title,
          },
        }, options.draft);
        writeOutput(globalOptions.json ? item : `Queued post draft: ${item.id}`, globalOptions);
      } finally {
        store.close();
      }
    });

  const replies = program.command("replies")
    .alias("r")
    .description("Classify replies and queue follow-up drafts");

  replies.command("check")
    .alias("scan")
    .description("Classify one reply payload supplied from notification/thread data")
    .requiredOption("--reply <id>", "Reply ID")
    .requiredOption("--post <id>", "Post ID")
    .requiredOption("--title <title>", "Post title")
    .requiredOption("--author <name>", "Reply author name")
    .requiredOption("--text <text>", "Reply text")
    .option("--url <url>", "Source URL")
    .action((options: { reply: string; post: string; title: string; author: string; text: string; url?: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const signal = classifyReplySignal({
        replyId: options.reply,
        postId: options.post,
        postTitle: options.title,
        replyAuthorName: options.author,
        replyText: options.text,
        sourceUrl: options.url,
      });
      writeOutput(signal, { json: true, ...globalOptions });
    });

  replies.command("draft")
    .alias("write")
    .description("Draft a follow-up for a supplied reply")
    .requiredOption("--reply <id>", "Reply ID")
    .requiredOption("--post <id>", "Post ID")
    .requiredOption("--title <title>", "Post title")
    .requiredOption("--author <name>", "Reply author name")
    .requiredOption("--text <text>", "Reply text")
    .action((options: { reply: string; post: string; title: string; author: string; text: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const signal = classifyReplySignal({
        replyId: options.reply,
        postId: options.post,
        postTitle: options.title,
        replyAuthorName: options.author,
        replyText: options.text,
      });
      writeOutput({ signal, draft: draftReply(signal) }, { json: true, ...globalOptions });
    });

  replies.command("queue")
    .alias("save")
    .description("Queue a follow-up draft for a supplied reply")
    .requiredOption("--reply <id>", "Reply ID")
    .requiredOption("--post <id>", "Post ID")
    .requiredOption("--group <id>", "Skool group ID required for eventual send")
    .requiredOption("--title <title>", "Post title")
    .requiredOption("--author <name>", "Reply author name")
    .requiredOption("--text <text>", "Reply text")
    .option("--draft <text>", "Draft text")
    .option("--url <url>", "Source URL")
    .action((options: { reply: string; post: string; group: string; title: string; author: string; text: string; draft?: string; url?: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        const signal = classifyReplySignal({
          replyId: options.reply,
          postId: options.post,
          postTitle: options.title,
          replyAuthorName: options.author,
          replyText: options.text,
          sourceUrl: options.url,
        });
        const item = queueReplyDraft(store, {
          ...signal,
          reason: signal.reason,
        }, options.draft, { groupId: options.group });
        if (item) {
          writeOutput(globalOptions.json ? item : `Queued reply draft: ${item.id}`, globalOptions);
        } else {
          writeOutput(globalOptions.json ? { queued: false, reason: signal.reason } : `Reply ignored: ${signal.reason}`, globalOptions);
        }
      } finally {
        store.close();
      }
    });

  const mcp = program.command("mcp")
    .description("Expose safe MCP-style tool metadata and handlers");

  mcp.command("tools")
    .description("List safe MCP tools")
    .action((_options, command: Command) => {
      writeOutput(listMcpTools(), { json: true, ...getGlobalOptions(command) });
    });

  mcp.command("status")
    .description("Show MCP server readiness")
    .action((_options, command: Command) => {
      writeOutput(getMcpStatus(), { json: true, ...getGlobalOptions(command) });
    });

  mcp.command("call")
    .description("Call a safe local MCP-style tool")
    .argument("<tool>", "Tool name")
    .action(async (tool: string, _options, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      try {
        const result = await handleMcpTool(tool, { queueStore: store });
        writeOutput(result, { json: true, ...globalOptions });
      } finally {
        store.close();
      }
    });

  const dashboard = program.command("dashboard")
    .alias("dash")
    .description("Run the local operator dashboard");

  dashboard.command("start")
    .description("Start the local dashboard server")
    .option("--port <port>", "Port to listen on", "4320")
    .action(async (options: { port: string }, command: Command) => {
      const globalOptions = getGlobalOptions(command);
      const db = openQueueDatabase(loadConfig());
      const store = createQueueStore(db);
      const { status } = await startDashboard({
        queueStore: store,
        port: Number(options.port) || 4320,
      });
      writeOutput(globalOptions.json ? status : `Dashboard running at http://127.0.0.1:${status.port}/`, globalOptions);
    });

  program.exitOverride((error) => {
    if (error.code === "commander.helpDisplayed") {
      return;
    }
    throw new AutoskoolError("USAGE_ERROR", error.message);
  });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  try {
    await buildProgram().parseAsync(argv);
  } catch (error) {
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(String(error));
    }
    process.exitCode = getExitCode(error);
  }
}

await main();
