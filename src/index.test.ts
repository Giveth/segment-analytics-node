import { assert } from "chai";
import Redis from "ioredis";
import {SegmentAnalytics} from "./index";

const redis = new Redis();
const redisOptions = {
    host: 'localhost',
    port: 6379
}


describe("segmentAnalytics test cases --->", SegmentAnalyticsTestCases);

// utils
const deleteKeysByPattern = (pattern: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        const stream = redis.scanStream({
            match: pattern
        });
        stream.on("data", (keys: string[]) => {
            if (keys.length) {
                const pipeline = redis.pipeline();
                keys.forEach((key) => {
                    pipeline.del(key);
                });
                pipeline.exec();
            }
        });
        stream.on("end", () => {
            resolve();
        });
        stream.on("error", (e) => {
            reject(e);
        });
    });
};

// main tests
function SegmentAnalyticsTestCases() {
  const userPayload = {
    userId: "test-test",
    traits: {
      firstName: "Testuser",
      email: "email@example.com",
      registeredAt: new Date(),
    },
  };

  const trackPayload = {
    event: "dragon",
    userId: "test",
    properties: {},
    anonymousId: null,
  };

  // Always returns status 200 no matter what
  // But if payload is too big or API is down returns error 400
  it("assert the SegmentApi is available and responds 200", async () => {
    const SEGMENT_API_KEY = "randomkey";
    const analytics = new SegmentAnalytics(SEGMENT_API_KEY, {
        redisConnectionInfo: redisOptions
    });
    const result = await analytics.postUser(userPayload);

    assert.isOk(result);
    assert.isTrue(result.status === 200);
    assert.isTrue(result.data?.success);
  });

  it("should enqueue userIdentify Queue when called", async () => {
    const SEGMENT_API_KEY = "randomkey";
    const analytics = new SegmentAnalytics(SEGMENT_API_KEY, {
        redisConnectionInfo: redisOptions
    });
    await analytics.identify(userPayload);
    const identifyQueueCount = await analytics.identifyQueue.getJobCounts();
    assert.isOk(identifyQueueCount);
    assert.isTrue(identifyQueueCount.active === 1);

    // clean queue for local tests
    deleteKeysByPattern('bull:identify:*')
  });

  it("should enqueue Track Queue when called", async () => {
    const SEGMENT_API_KEY = "randomkey";
    const analytics = new SegmentAnalytics(SEGMENT_API_KEY, {
        redisConnectionInfo: redisOptions
    });
    await analytics.track(trackPayload);
    const trackQueueCount = await analytics.trackQueue.getJobCounts();
    assert.isOk(trackQueueCount);
    assert.isTrue(trackQueueCount.active === 1);

    // clean queue for local tests
    await  deleteKeysByPattern('bull:track:*')
  });
}
