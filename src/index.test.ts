import { assert } from "chai";
import SegmentAnalytics from "./index";

describe("segmentAnalytics test cases --->", SegmentAnalyticsTestCases);

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
    const analytics = new SegmentAnalytics(SEGMENT_API_KEY);
    const result = await analytics.postUser(userPayload);

    assert.isOk(result);
    assert.isTrue(result.status === 200);
    assert.isTrue(result.data?.success);
  });

  it("should enqueue userIdentify Queue when called", async () => {
    const SEGMENT_API_KEY = "randomkey";
    const analytics = new SegmentAnalytics(SEGMENT_API_KEY);
    await analytics.identify(userPayload);
    const identifyQueueCount = await analytics.identifyQueue.getJobCounts();
    assert.isOk(identifyQueueCount);
    assert.isTrue(identifyQueueCount.active === 1);

    // clean queue for local tests
    const queueStatus = analytics.identifyQueue.multi();
    queueStatus.del(analytics.identifyQueue.toKey("active"));
    queueStatus.exec();
  });

  it("should enqueue Track Queue when called", async () => {
    const SEGMENT_API_KEY = "randomkey";
    const analytics = new SegmentAnalytics(SEGMENT_API_KEY);
    await analytics.track(trackPayload);
    const trackQueueCount = await analytics.trackQueue.getJobCounts();
    assert.isOk(trackQueueCount);
    assert.isTrue(trackQueueCount.active === 1);

    // clean queue for local tests
    const queueStatus = analytics.trackQueue.multi();
    queueStatus.del(analytics.trackQueue.toKey("active"));
    queueStatus.exec();
  });
}
