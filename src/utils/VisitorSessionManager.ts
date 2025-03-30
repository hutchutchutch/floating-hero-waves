
import { supabase } from "@/integrations/supabase/client";

/**
 * Manages anonymous visitor sessions using a combination of client-side
 * storage and server-side tracking.
 */
class VisitorSessionManager {
  private visitorId: string | null = null;
  private sessionId: string | null = null;
  private isInitialized = false;
  private fallbackToLocalOnly = false;

  /**
   * Initialize the visitor session manager
   * This should be called when the application starts
   */
  async initialize(): Promise<string> {
    if (this.isInitialized) {
      return this.getVisitorId();
    }

    this.visitorId = this.getOrCreateVisitorId();
    
    try {
      await this.trackVisitorSession();
      this.isInitialized = true;
      return this.visitorId;
    } catch (error) {
      console.error('Error initializing visitor session:', error);
      this.isInitialized = true; // Still mark as initialized even with error
      return this.visitorId;
    }
  }

  /**
   * Get the current visitor ID or create a new one
   */
  getOrCreateVisitorId(): string {
    // Check if we already have a visitor ID in localStorage
    let visitorId = localStorage.getItem('visitor_id');
    
    // If not, create a new one
    if (!visitorId) {
      visitorId = this.generateUUID();
      localStorage.setItem('visitor_id', visitorId);
      
      // Save creation timestamp for potential expiry check
      localStorage.setItem('session_created_at', new Date().toISOString());
    } else {
      // Check if we should update the session creation timestamp
      // This helps with keeping track of when the session was last used
      const lastActive = localStorage.getItem('session_last_active');
      if (lastActive) {
        const lastActiveDate = new Date(lastActive);
        const now = new Date();
        
        // Update last active time if it's been more than 1 hour
        if (now.getTime() - lastActiveDate.getTime() > 60 * 60 * 1000) {
          localStorage.setItem('session_last_active', now.toISOString());
        }
      } else {
        localStorage.setItem('session_last_active', new Date().toISOString());
      }
    }
    
    return visitorId;
  }
  
  /**
   * Get the visitor ID
   */
  getVisitorId(): string {
    if (!this.visitorId) {
      this.visitorId = this.getOrCreateVisitorId();
    }
    return this.visitorId;
  }
  
  /**
   * Get or create a session ID for the current visitor
   */
  async getOrCreateSessionId(): Promise<string | null> {
    if (this.sessionId) {
      return this.sessionId;
    }
    
    // If we previously got RLS errors, use local session ID instead
    if (this.fallbackToLocalOnly) {
      const localSessionId = localStorage.getItem('local_session_id') || this.generateUUID();
      localStorage.setItem('local_session_id', localSessionId);
      this.sessionId = localSessionId;
      console.log('Using local-only session ID due to previous RLS errors:', localSessionId);
      return localSessionId;
    }
    
    // Make sure we have a visitor ID
    const visitorId = this.getVisitorId();
    
    try {
      // Check if there's an active session for this visitor
      const { data: existingSessions, error: sessionsError } = await supabase
        .from('sessions')
        .select('id, status')
        .eq('visitor_id', visitorId)
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1);
        
      if (sessionsError) {
        console.error('Error fetching existing sessions:', sessionsError);
        
        // If this is a permissions error, switch to local-only mode
        if (sessionsError.code === '42501') {
          console.log('Permission denied when accessing sessions table, switching to local-only mode');
          this.fallbackToLocalOnly = true;
          return this.getOrCreateSessionId(); // Retry with fallback
        }
        
        return null;
      }
      
      // If an active session exists, use it
      if (existingSessions && existingSessions.length > 0) {
        this.sessionId = existingSessions[0].id;
        return this.sessionId;
      }
      
      // Create a new session
      const { data: newSession, error: createError } = await supabase
        .from('sessions')
        .insert({
          visitor_id: visitorId,
          status: 'active'
        })
        .select();
        
      if (createError) {
        console.error('Error creating new session:', createError);
        
        // If this is a permissions error, switch to local-only mode
        if (createError.code === '42501') {
          console.log('Permission denied when creating session, switching to local-only mode');
          this.fallbackToLocalOnly = true;
          return this.getOrCreateSessionId(); // Retry with fallback
        }
        
        return null;
      }
      
      if (newSession && newSession.length > 0) {
        this.sessionId = newSession[0].id;
        return this.sessionId;
      }
      
      return null;
    } catch (error) {
      console.error('Error in getOrCreateSessionId:', error);
      
      // Switch to local-only mode on any error
      this.fallbackToLocalOnly = true;
      return this.getOrCreateSessionId(); // Retry with fallback
    }
  }
  
  /**
   * Track visitor session on the server
   */
  private async trackVisitorSession(): Promise<void> {
    if (!this.visitorId) {
      return;
    }
    
    try {
      // Get client information
      const userAgent = navigator.userAgent;
      
      // Check if the visitor session exists
      const { data: existingVisitor, error: visitorError } = await supabase
        .from('anonymous_sessions')
        .select('*')
        .eq('visitor_id', this.visitorId)
        .single();
        
      if (visitorError && visitorError.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error('Error checking visitor session:', visitorError);
        return;
      }
      
      if (existingVisitor) {
        // Update existing visitor session
        await supabase
          .from('anonymous_sessions')
          .update({
            last_seen_at: new Date().toISOString(),
            user_agent: userAgent,
            visit_count: existingVisitor.visit_count + 1
          })
          .eq('id', existingVisitor.id);
      } else {
        // Create new visitor session
        await supabase
          .from('anonymous_sessions')
          .insert({
            visitor_id: this.visitorId,
            user_agent: userAgent
          });
      }
    } catch (error) {
      console.error('Error tracking visitor session:', error);
    }
  }
  
  /**
   * Generate a UUID for visitor identification
   */
  private generateUUID(): string {
    // Simple UUID generation using crypto API if available,
    // otherwise fallback to a less secure but functional method
    if (window.crypto && window.crypto.randomUUID) {
      return window.crypto.randomUUID();
    }
    
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
  
  /**
   * End the current session
   */
  async endCurrentSession(): Promise<boolean> {
    if (!this.sessionId) {
      return false;
    }
    
    // If we're in local-only mode, just clean up local storage
    if (this.fallbackToLocalOnly) {
      this.sessionId = null;
      return true;
    }
    
    try {
      const { error } = await supabase
        .from('sessions')
        .update({ 
          status: 'completed', 
          updated_at: new Date().toISOString() 
        })
        .eq('id', this.sessionId);
        
      if (error) {
        console.error('Error ending session:', error);
        return false;
      }
      
      this.sessionId = null;
      return true;
    } catch (error) {
      console.error('Exception ending session:', error);
      return false;
    }
  }
  
  /**
   * Get the current session ID
   */
  getCurrentSessionId(): string | null {
    return this.sessionId;
  }
  
  /**
   * Check if we're using local-only mode due to permission errors
   */
  isUsingLocalOnlyMode(): boolean {
    return this.fallbackToLocalOnly;
  }
}

// Export a singleton instance
const visitorSessionManager = new VisitorSessionManager();
export default visitorSessionManager;
