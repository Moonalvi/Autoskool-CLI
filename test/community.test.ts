import assert from "node:assert/strict";
import test from "node:test";

import { formatCommunityFeed, formatJoinedCommunityList } from "../src/community/format.js";
import { getCommunityFeed, listJoinedCommunities, normalizeCommunityFeed, normalizeJoinedCommunities } from "../src/community/index.js";
import type { SkoolTransport } from "../src/skool-transport/index.js";

test("community feed normalization produces stable items", () => {
  const items = normalizeCommunityFeed({
    postTrees: [
      {
        post: {
          id: "post-1",
          name: "hello-world",
          labelId: "section-1",
          createdAt: "2026-05-19T00:00:00.000Z",
          metadata: {
            title: "Hello world",
            content: "Body text",
            comments: 0,
            upvotes: 12,
            attachments: "image-1",
            attachmentsData: JSON.stringify([
              {
                id: "image-1",
                metadata: {
                  content_type: "image/png",
                  file_name: "hello.png",
                  read_url: "https://assets.skool.com/f/group/hello.png",
                  image_md_url: "https://assets.skool.com/f/group/hello-md.png",
                  src_width: 1200,
                  src_height: 800,
                },
              },
            ]),
          },
        },
        user: { name: "Moon" },
      },
    ],
    currentGroup: {
      labels: [
        {
          id: "section-1",
          metadata: {
            displayName: "General Discussion",
          },
        },
      ],
    },
  }, "demo");

  assert.deepEqual(items, [
    {
      id: "post-1",
      title: "Hello world",
      authorName: "Moon",
      body: "Body text",
      commentCount: 0,
      likeCount: 12,
      sectionId: "section-1",
      sectionName: "General Discussion",
      attachmentIds: ["image-1"],
      attachments: [
        {
          type: "image",
          source: "feed-preview",
          id: "image-1",
          url: "https://assets.skool.com/f/group/hello.png",
          thumbnailUrl: "https://assets.skool.com/f/group/hello-md.png",
          fileName: "hello.png",
          mimeType: "image/png",
          width: 1200,
          height: 800,
          videoId: null,
          provider: null,
          playbackId: null,
          streamUrl: null,
          streamHeaders: null,
          expiresAt: null,
          durationMs: null,
          aspectRatio: null,
        },
      ],
      createdAt: "2026-05-19T00:00:00.000Z",
      url: "https://www.skool.com/demo/hello-world",
    },
  ]);
});

test("community feed handles empty feed cleanly", async () => {
  const transport: SkoolTransport = {
    async resolveBuildId() {
      return "unused";
    },
    async readNextData() {
      return {
        source: "http",
        fetchedAt: "2026-05-19T00:00:00.000Z",
        value: { pageProps: { postTrees: [] } },
      };
    },
  };

  const feed = await getCommunityFeed(transport, { community: "demo" });
  assert.equal(feed.community, "demo");
  assert.equal(feed.items.length, 0);
  assert.equal(feed.source, "http");
});

test("community feed can enrich full media details from post pages", async () => {
  const calls: string[] = [];
  const transport: SkoolTransport = {
    async resolveBuildId() {
      return "unused";
    },
    async readNextData(path) {
      calls.push(path);
      if (path === "/demo/hello-world") {
        return {
          source: "http",
          fetchedAt: "2026-05-19T00:00:01.000Z",
          value: {
            pageProps: {
              postTree: {
                post: {
                  id: "post-1",
                  name: "hello-world",
                  metadata: {
                    attachments: "image-1,image-2",
                    attachmentsData: JSON.stringify([
                      {
                        id: "image-1",
                        metadata: {
                          content_type: "image/png",
                          file_name: "one.png",
                          read_url: "https://assets.skool.com/f/group/one.png",
                        },
                      },
                      {
                        id: "image-2",
                        metadata: {
                          content_type: "image/png",
                          file_name: "two.png",
                          read_url: "https://assets.skool.com/f/group/two.png",
                        },
                      },
                    ]),
                  },
                },
              },
            },
          },
        };
      }
      return {
        source: "http",
        fetchedAt: "2026-05-19T00:00:00.000Z",
        value: {
          pageProps: {
            postTrees: [
              {
                post: {
                  id: "post-1",
                  name: "hello-world",
                  metadata: {
                    title: "Hello",
                    attachments: "image-1",
                    imagePreview: "https://assets.skool.com/f/group/preview.png",
                  },
                },
                user: { name: "Moon" },
              },
            ],
          },
        },
      };
    },
    async resolveVideoPlayback(videoId) {
      assert.equal(videoId, "video-1");
      return {
        videoId,
        playbackId: "playback-1",
        playbackToken: "playback-token",
        thumbnailToken: null,
        storyboardToken: null,
        expiresAt: "2026-05-20T20:00:00.000Z",
        durationMs: 58000,
        aspectRatio: "16:9",
      };
    },
  };

  const feed = await getCommunityFeed(transport, { community: "demo", includeMedia: true });
  assert.deepEqual(calls, ["/demo", "/demo/hello-world"]);
  assert.deepEqual(feed.items[0].attachmentIds, ["image-1", "image-2"]);
  assert.equal(feed.items[0].attachments.length, 2);
  assert.equal(feed.items[0].attachments[1].url, "https://assets.skool.com/f/group/two.png");
  assert.equal(feed.items[0].attachments[1].source, "post-detail");
});

test("community feed enriches Skool-hosted video stream data", async () => {
  const transport: SkoolTransport = {
    async resolveBuildId() {
      return "unused";
    },
    async readNextData(path) {
      if (path === "/demo/video-post") {
        return {
          source: "http",
          fetchedAt: "2026-05-19T00:00:01.000Z",
          value: {
            pageProps: {
              postTree: {
                post: {
                  id: "post-1",
                  name: "video-post",
                  metadata: {
                    videoIds: "video-1",
                    imagePreview: "https://image.video.skool.com/playback-1/thumbnail.png?token=thumb",
                  },
                },
              },
            },
          },
        };
      }
      return {
        source: "http",
        fetchedAt: "2026-05-19T00:00:00.000Z",
        value: {
          pageProps: {
            postTrees: [
              {
                post: {
                  id: "post-1",
                  name: "video-post",
                  metadata: {
                    title: "Video",
                    videoIds: "video-1",
                    imagePreview: "https://image.video.skool.com/playback-1/thumbnail.png?token=thumb",
                  },
                },
              },
            ],
          },
        },
      };
    },
    async resolveVideoPlayback(videoId) {
      return {
        videoId,
        playbackId: "playback-1",
        playbackToken: "playback-token",
        thumbnailToken: null,
        storyboardToken: null,
        expiresAt: "2026-05-20T20:00:00.000Z",
        durationMs: 58000,
        aspectRatio: "16:9",
      };
    },
  };

  const feed = await getCommunityFeed(transport, { community: "demo", includeMedia: true });
  const attachment = feed.items[0].attachments[0];
  assert.equal(attachment.provider, "skool");
  assert.equal(attachment.playbackId, "playback-1");
  assert.equal(attachment.streamUrl, "https://stream.video.skool.com/playback-1.m3u8?token=playback-token");
  assert.deepEqual(attachment.streamHeaders, {
    Referer: "https://www.skool.com/",
    Origin: "https://www.skool.com",
  });
  assert.equal(attachment.durationMs, 58000);
});

test("joined community normalization merges pinned and all groups", () => {
  const communities = normalizeJoinedCommunities({
    self: {
      pinnedGroups: [
        {
          id: "group-2",
          name: "beta-builders",
          metadata: {
            displayName: "Beta Builders",
            description: "Pinned group",
            owner: JSON.stringify({
              id: "owner-2",
              name: "beta-owner",
              first_name: "Beta",
              last_name: "Owner",
            }),
          },
        },
      ],
      allGroups: [
        {
          id: "group-1",
          name: "alpha-lab",
          metadata: {
            displayName: "Alpha Lab",
            owner: JSON.stringify({
              id: "owner-1",
              name: "alpha-owner",
              first_name: "Alpha",
              last_name: "Owner",
            }),
          },
        },
        {
          id: "group-2",
          name: "beta-builders",
          metadata: {
            displayName: "Beta Builders",
            owner: JSON.stringify({
              id: "owner-2",
              name: "beta-owner",
              first_name: "Beta",
              last_name: "Owner",
            }),
          },
        },
      ],
    },
  });

  assert.deepEqual(communities, [
    {
      id: "beta-builders",
      slug: "beta-builders",
      name: "Beta Builders",
      description: "Pinned group",
      groupId: "group-2",
      ownerId: "owner-2",
      ownerUsername: "beta-owner",
      ownerName: "Beta Owner",
      ownerProfileUrl: "https://www.skool.com/@beta-owner",
      href: "https://www.skool.com/beta-builders",
      pinned: true,
    },
    {
      id: "alpha-lab",
      slug: "alpha-lab",
      name: "Alpha Lab",
      description: "",
      groupId: "group-1",
      ownerId: "owner-1",
      ownerUsername: "alpha-owner",
      ownerName: "Alpha Owner",
      ownerProfileUrl: "https://www.skool.com/@alpha-owner",
      href: "https://www.skool.com/alpha-lab",
      pinned: false,
    },
  ]);
});

test("joined community list uses browser fallback only", async () => {
  const result = await listJoinedCommunities({
    async readPageProps(url: string) {
      assert.equal(url, "https://www.skool.com/");
      return {
        self: {
          allGroups: [
            {
              id: "group-1",
              name: "alpha-lab",
              metadata: {
                displayName: "Alpha Lab",
                owner: JSON.stringify({
                  id: "owner-1",
                  name: "alpha-owner",
                  first_name: "Alpha",
                  last_name: "Owner",
                }),
              },
            },
          ],
        },
      };
    },
  });

  assert.equal(result.source, "browser-fallback");
  assert.equal(result.communities.length, 1);
  assert.equal(result.communities[0].slug, "alpha-lab");
  assert.equal(result.communities[0].ownerName, "Alpha Owner");
});

test("community feed human formatter keeps terminal output organized", () => {
  const longBody = "I am stuck with an automation handoff and need advice on what to check next. ".repeat(10).trim();
  const longUrl = `https://assets.skool.com/f/group/${"a".repeat(160)}/full-image.png?token=${"b".repeat(160)}`;
  const output = formatCommunityFeed({
    community: "demo",
    source: "http",
    fetchedAt: "2026-05-20T17:00:00.000Z",
    items: [
      {
        id: "post-1",
        title: "How do I fix this workflow?",
        authorName: "Moon",
        body: longBody,
        commentCount: 2,
        likeCount: 4,
        sectionId: "support",
        sectionName: "Support Needed",
        attachmentIds: ["image-1"],
        attachments: [
          {
            type: "image",
            source: "post-detail",
            id: "image-1",
            url: longUrl,
            thumbnailUrl: null,
            fileName: "full-image.png",
            mimeType: "image/png",
            width: null,
            height: null,
            videoId: null,
            provider: null,
            playbackId: null,
            streamUrl: null,
            streamHeaders: null,
            expiresAt: null,
            durationMs: null,
            aspectRatio: null,
          },
        ],
        createdAt: "2026-05-20T16:00:00.000Z",
        url: "https://www.skool.com/demo/post-1",
      },
    ],
  });

  assert.match(output, /Community Feed: demo/);
  assert.match(output, /1\. How do I fix this workflow\?/);
  assert.match(output, /Section: Support Needed/);
  assert.match(output, /Stats: 4 likes \| 2 comments \| media: 1 image/);
  assert.match(output, /Body:\n     I am stuck/);
  assert.match(output, new RegExp(longUrl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(output, new RegExp(longBody.slice(-90).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("joined communities human formatter renders a compact table", () => {
  const output = formatJoinedCommunityList({
    source: "browser-fallback",
    fetchedAt: "2026-05-20T17:00:00.000Z",
    communities: [
      {
        id: "alpha-lab",
        slug: "alpha-lab",
        name: "Alpha Lab",
        description: "",
        groupId: "group-1",
        ownerId: "owner-1",
        ownerUsername: "alpha-owner",
        ownerName: "Alpha Owner",
        ownerProfileUrl: "https://www.skool.com/@alpha-owner",
        href: "https://www.skool.com/alpha-lab",
        pinned: false,
      },
    ],
  });

  assert.match(output, /Joined Communities/);
  assert.match(output, /Total: 1/);
  assert.match(output, /Name\s+Owner\s+Slug/);
  assert.match(output, /Alpha Lab\s+Alpha Owner\s+alpha-lab/);
});
