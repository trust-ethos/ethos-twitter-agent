-- Ethos Twitter Agent Database Schema
-- Created for Neon PostgreSQL

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- Application state and configuration
CREATE TABLE app_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(255) UNIQUE NOT NULL,
    value JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Twitter users cache
CREATE TABLE twitter_users (
    id BIGINT PRIMARY KEY, -- Twitter user ID
    username VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    description TEXT,
    followers_count INTEGER,
    following_count INTEGER,
    tweet_count INTEGER,
    verified BOOLEAN DEFAULT FALSE,
    profile_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ethos user data cache
CREATE TABLE ethos_users (
    twitter_user_id BIGINT PRIMARY KEY REFERENCES twitter_users(id),
    ethos_score DECIMAL(10,2),
    has_reviews BOOLEAN DEFAULT FALSE,
    has_vouches BOOLEAN DEFAULT FALSE,
    review_count INTEGER DEFAULT 0,
    vouch_count INTEGER DEFAULT 0,
    last_checked TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- TWEET VALIDATION SYSTEM
-- ============================================================================

-- Tweets being validated
CREATE TABLE tweets (
    id BIGINT PRIMARY KEY, -- Twitter tweet ID
    author_id BIGINT NOT NULL REFERENCES twitter_users(id),
    content TEXT NOT NULL,
    reply_count INTEGER DEFAULT 0,
    retweet_count INTEGER DEFAULT 0,
    quote_count INTEGER DEFAULT 0,
    like_count INTEGER DEFAULT 0,
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tweet validation table removed - no longer needed

-- Tweet engagement participants (retweeters, repliers, quoters)
CREATE TABLE tweet_engagements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id BIGINT NOT NULL REFERENCES tweets(id),
    user_id BIGINT NOT NULL REFERENCES twitter_users(id),
    engagement_type VARCHAR(20) NOT NULL CHECK (engagement_type IN ('retweet', 'reply', 'quote', 'like')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tweet_id, user_id, engagement_type)
);

-- ============================================================================
-- SAVED TWEETS SYSTEM
-- ============================================================================

-- Saved tweets from Ethos API
CREATE TABLE saved_tweets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id BIGINT NOT NULL,
    tweet_url TEXT NOT NULL,
    original_content TEXT NOT NULL,
    author_user_id BIGINT,
    author_username VARCHAR(255),
    saved_by_user_id BIGINT NOT NULL REFERENCES twitter_users(id),
    saved_by_username VARCHAR(255) NOT NULL,
    
    -- Ethos metadata
    ethos_review_id BIGINT,
    ethos_source VARCHAR(255),
    
    published_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tweet_id, saved_by_user_id)
);

-- ============================================================================
-- COMMAND PROCESSING SYSTEM
-- ============================================================================

-- Command processing history
CREATE TABLE command_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id BIGINT NOT NULL,
    command_type VARCHAR(50) NOT NULL,
    requester_user_id BIGINT NOT NULL REFERENCES twitter_users(id),
    target_data JSONB, -- Store command parameters
    
    -- Processing status
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    result JSONB,
    error_message TEXT,
    
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- API USAGE TRACKING SYSTEM
-- ============================================================================

-- Track Twitter API usage for cost monitoring
CREATE TABLE api_usage_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- API call details
    endpoint VARCHAR(255) NOT NULL, -- e.g., 'tweets/search/recent', 'tweets/:id/retweeted_by'
    method VARCHAR(10) NOT NULL, -- GET, POST, etc.
    action_type VARCHAR(50) NOT NULL, -- 'mention_check', 'validate_retweeters', 'validate_repliers', etc.
    
    -- Context
    related_tweet_id BIGINT, -- If related to a specific tweet
    related_command VARCHAR(50), -- 'validate', 'save', 'profile', etc.
    user_id BIGINT REFERENCES twitter_users(id), -- User who triggered the action
    
    -- Usage metrics
    posts_consumed INTEGER NOT NULL DEFAULT 1, -- Number of posts counted toward quota
    response_status INTEGER, -- HTTP status code
    rate_limited BOOLEAN DEFAULT FALSE,
    
    -- Metadata
    request_details JSONB, -- Store request parameters for debugging
    response_summary JSONB, -- Store response metadata (user count, etc.)
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- App state indexes
CREATE INDEX idx_app_state_key ON app_state(key);

-- Twitter users indexes
CREATE INDEX idx_twitter_users_username ON twitter_users(username);
CREATE INDEX idx_twitter_users_updated_at ON twitter_users(updated_at);

-- Ethos users indexes
CREATE INDEX idx_ethos_users_last_checked ON ethos_users(last_checked);
CREATE INDEX idx_ethos_users_has_reviews ON ethos_users(has_reviews);
CREATE INDEX idx_ethos_users_has_vouches ON ethos_users(has_vouches);

-- Tweets indexes
CREATE INDEX idx_tweets_author_id ON tweets(author_id);
CREATE INDEX idx_tweets_published_at ON tweets(published_at);

-- Tweet validation indexes removed - no longer needed

-- Tweet engagements indexes
CREATE INDEX idx_tweet_engagements_tweet_id ON tweet_engagements(tweet_id);
CREATE INDEX idx_tweet_engagements_user_id ON tweet_engagements(user_id);
CREATE INDEX idx_tweet_engagements_type ON tweet_engagements(engagement_type);

-- Saved tweets indexes
CREATE INDEX idx_saved_tweets_tweet_id ON saved_tweets(tweet_id);
CREATE INDEX idx_saved_tweets_saved_by ON saved_tweets(saved_by_user_id);
CREATE INDEX idx_saved_tweets_published_at ON saved_tweets(published_at);

-- Command history indexes
CREATE INDEX idx_command_history_tweet_id ON command_history(tweet_id);
CREATE INDEX idx_command_history_requester ON command_history(requester_user_id);
CREATE INDEX idx_command_history_status ON command_history(status);
CREATE INDEX idx_command_history_created_at ON command_history(created_at);

-- API usage log indexes
CREATE INDEX idx_api_usage_log_endpoint ON api_usage_log(endpoint);
CREATE INDEX idx_api_usage_log_action_type ON api_usage_log(action_type);
CREATE INDEX idx_api_usage_log_related_command ON api_usage_log(related_command);
CREATE INDEX idx_api_usage_log_created_at ON api_usage_log(created_at);
CREATE INDEX idx_api_usage_log_user_id ON api_usage_log(user_id);
CREATE INDEX idx_api_usage_log_tweet_id ON api_usage_log(related_tweet_id);

-- ============================================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================================

-- Auto-update timestamp function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply auto-update triggers to relevant tables
CREATE TRIGGER update_app_state_updated_at BEFORE UPDATE ON app_state 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_twitter_users_updated_at BEFORE UPDATE ON twitter_users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ethos_users_updated_at BEFORE UPDATE ON ethos_users 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tweets_updated_at BEFORE UPDATE ON tweets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Tweet validation trigger removed - no longer needed

CREATE TRIGGER update_saved_tweets_updated_at BEFORE UPDATE ON saved_tweets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE QUERIES AND VIEWS
-- ============================================================================

-- Latest validations view removed - no longer needed

-- View for engagement summary by tweet
CREATE VIEW tweet_engagement_summary AS
SELECT 
    te.tweet_id,
    COUNT(*) as total_engagements,
    COUNT(*) FILTER (WHERE te.engagement_type = 'retweet') as retweets,
    COUNT(*) FILTER (WHERE te.engagement_type = 'reply') as replies,
    COUNT(*) FILTER (WHERE te.engagement_type = 'quote') as quotes,
    COUNT(*) FILTER (WHERE te.engagement_type = 'like') as likes,
    COUNT(DISTINCT te.user_id) as unique_users
FROM tweet_engagements te
GROUP BY te.tweet_id;

-- ============================================================================
-- INITIAL DATA
-- ============================================================================

-- Insert initial app state
INSERT INTO app_state (key, value) VALUES 
('last_processed_tweet_id', '{}'),
('polling_status', '{"enabled": false, "last_run": null}'),
('rate_limit_status', '{"remaining": 1000, "reset_time": null}')
ON CONFLICT (key) DO NOTHING; 