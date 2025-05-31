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

-- Tweet validation results
CREATE TABLE tweet_validations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tweet_id BIGINT NOT NULL REFERENCES tweets(id),
    validation_key VARCHAR(255) NOT NULL, -- Original KV key format
    
    -- Engagement stats
    total_unique_users INTEGER NOT NULL,
    reputable_users INTEGER NOT NULL,
    ethos_active_users INTEGER NOT NULL,
    reputable_percentage DECIMAL(5,2) NOT NULL,
    ethos_active_percentage DECIMAL(5,2) NOT NULL,
    
    -- Analysis metadata
    analysis_started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    analysis_completed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    rate_limited BOOLEAN DEFAULT FALSE,
    incomplete_data BOOLEAN DEFAULT FALSE,
    
    -- Raw engagement data
    engagement_data JSONB NOT NULL, -- Store detailed engagement stats
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(tweet_id, validation_key)
);

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

-- Tweet validations indexes
CREATE INDEX idx_tweet_validations_tweet_id ON tweet_validations(tweet_id);
CREATE INDEX idx_tweet_validations_created_at ON tweet_validations(created_at);
CREATE INDEX idx_tweet_validations_validation_key ON tweet_validations(validation_key);

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

CREATE TRIGGER update_tweet_validations_updated_at BEFORE UPDATE ON tweet_validations 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_saved_tweets_updated_at BEFORE UPDATE ON saved_tweets 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- SAMPLE QUERIES AND VIEWS
-- ============================================================================

-- View for latest validations with tweet info
CREATE VIEW latest_validations AS
SELECT 
    tv.*,
    t.content as tweet_content,
    t.author_id,
    tu.username as author_username,
    tu.display_name as author_display_name
FROM tweet_validations tv
JOIN tweets t ON tv.tweet_id = t.id
JOIN twitter_users tu ON t.author_id = tu.id
ORDER BY tv.created_at DESC;

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