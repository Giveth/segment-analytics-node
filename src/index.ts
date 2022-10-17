import { RedisOptions } from "ioredis";

import * as Bull from "bull";

const axios = require("axios");
const axiosRetry = require("axios-retry");

const SEGMENT_API_HOST = "https://api.segment.io";
const TRACK_URL = "v1/track";
const IDENTIFY_USER_URL = "v1/identify";

// Refis Defaults:
const DEFAULT_REDIS_PORT = 6379;
const DEFAULT_REDIS_HOST = "localhost";

// Queues
const IDENTIFY_USER_QUEUE = "identify";
const TRACK_DATA_QUEUE = "track";

// Concurrent Jobs
const numberOfConcurrentJob = 1;

interface SegmentOptions {
  redisConnectionInfo?: RedisOptions;
  requestsPerSecond?: number;
}

interface AnalyticsUserPayload {
  userId: string;
  traits: {
    firstName: string;
    email: string;
    registeredAt: Date;
  };
}

interface AnalyticsDataPayload {
  event: string;
  userId: string;
  properties: any;
  anonymousId?: string | null | undefined;
}

class SegmentAnalytics {
  /**
   * Initialize a new `Analytics` with your Segment project's `writeKey` and an
   * optional dictionary of `options`.
   *
   * @param {String} apiKey
   * @param {Object} [options] (optional)
   *   @property
   *   @property {Object} [redisConnectionInfo]
   *      @property {Number} [port]
   *      @property {String} [host]
   *      @property {String} [password]
   *   @property {Number} [rateLimit] (default: 10)
   */

  private apiKey: string;
  private host: string;
  private redisOptions: RedisOptions;

  // The HTTP API has no hard rate limit.
  // However, Segment recommends not exceeding 500 requests per second, including large groups of events sent with a single batch request.
  // Always returns status 200 but if payload is too big, returns error 400
  private queueRateLimit; // rate limit of queues
  public identifyQueue: Bull.Queue<AnalyticsUserPayload>;
  public trackQueue: Bull.Queue<AnalyticsDataPayload>;

  constructor(apiKey: string, options?: SegmentOptions) {
    options = options || {};
    this.apiKey = apiKey;
    this.host = SEGMENT_API_HOST;
    this.redisOptions = {
      host: options.redisConnectionInfo?.host || DEFAULT_REDIS_HOST,
      port: options.redisConnectionInfo?.port || DEFAULT_REDIS_PORT,
    };

    if (options.redisConnectionInfo?.password) {
      this.redisOptions.password = options.redisConnectionInfo?.password;
    }

    this.queueRateLimit = {
      max: options.requestsPerSecond || 10,
      duration: 1000, // second
    };

    // INSTANCIATE QUEUES
    this.identifyQueue = new Bull<AnalyticsUserPayload>(IDENTIFY_USER_QUEUE, {
      redis: this.redisOptions,
      limiter: this.queueRateLimit,
    });
    this.trackQueue = new Bull<AnalyticsDataPayload>(TRACK_DATA_QUEUE, {
      redis: this.redisOptions,
      limiter: this.queueRateLimit,
    });
    this.processIdentifyUserQueue();
    this.processTrackDataQueue();
  }

  // ENQUEUE METHODS
  async enqueue(
    queue: "identify" | "track",
    payload: AnalyticsUserPayload | AnalyticsDataPayload
  ) {
    switch (queue) {
      case IDENTIFY_USER_QUEUE:
        return await this.identifyQueue.add(payload as AnalyticsUserPayload);
      case TRACK_DATA_QUEUE:
        return await this.trackQueue.add(payload as AnalyticsDataPayload);
      default:
        throw new Error("Invalid Analytics Queue");
    }
  }

  async track(payload: AnalyticsDataPayload): Promise<void> {
    await this.enqueue(TRACK_DATA_QUEUE, payload);
  }

  async identify(payload: AnalyticsUserPayload): Promise<void> {
    await this.enqueue(IDENTIFY_USER_QUEUE, payload);
  }

  // HTTP REQUESTS METHODS
  async postUser(payload: AnalyticsUserPayload) {
    try {
      const result = await axios.post(
        `${this.host}/${IDENTIFY_USER_URL}`,
        payload,
        {
          auth: {
            username: this.apiKey,
          },
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      return result;
    } catch (e) {
      throw new Error(e.message);
    }
  }

  async postData(payload: AnalyticsDataPayload) {
    try {
      const result = await axios.post(`${this.host}/${TRACK_URL}`, payload, {
        auth: {
          username: this.apiKey,
        },
        headers: {
          "Content-Type": "application/json",
        },
      });

      return result;
    } catch (e) {
      throw new Error(e.message);
    }
  }

  // PROCESSOR METHODS
  processIdentifyUserQueue() {
    this.identifyQueue.process(numberOfConcurrentJob, async (job, done) => {
      const userPayload = job.data;
      try {
        await this.postUser(userPayload);
      } finally {
        done();
      }
    });
  }

  processTrackDataQueue() {
    this.trackQueue.process(numberOfConcurrentJob, async (job, done) => {
      const userPayload = job.data;
      try {
        await this.postData(userPayload);
      } finally {
        done();
      }
    });
  }
}

module.exports = SegmentAnalytics;
