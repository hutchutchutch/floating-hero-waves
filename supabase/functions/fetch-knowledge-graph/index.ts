
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1"
import neo4jDriver from "https://esm.sh/neo4j-driver@5.18.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-visitor-id',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { visitorId } = await req.json();
    
    if (!visitorId) {
      throw new Error('Missing required field: visitorId');
    }
    
    console.log('Fetching knowledge graph for visitor:', visitorId);
    
    // Initialize Neo4j connection
    const NEO4J_URI = Deno.env.get('NEO4J_URI') || '';
    const NEO4J_USERNAME = Deno.env.get('NEO4J_USERNAME') || '';
    const NEO4J_PASSWORD = Deno.env.get('NEO4J_PASSWORD') || '';
    
    if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
      throw new Error('Neo4j connection details not fully configured');
    }
    
    // Connect to Neo4j
    let driver = null;
    let session = null;
    let graphData = { nodes: [], links: [] };
    
    try {
      console.log('Initializing Neo4j connection...');
      driver = neo4jDriver.driver(
        NEO4J_URI,
        neo4jDriver.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD)
      );
      
      // Verify connection
      await driver.verifyConnectivity();
      console.log('Neo4j connection verified successfully');
      
      // Create session
      session = driver.session();
      
      // Query for the Person node and all connected nodes (1-2 levels deep)
      const result = await session.run(`
        MATCH (p:Person {visitorId: $visitorId})
        OPTIONAL MATCH (p)-[r1]-(level1)
        OPTIONAL MATCH (level1)-[r2]-(level2)
        WHERE level2 <> p  // Avoid cycles back to the person
        
        WITH p, r1, level1, r2, level2
        
        // Collect all nodes
        WITH 
          collect(DISTINCT p) + collect(DISTINCT level1) + collect(DISTINCT level2) as allNodes,
          collect(DISTINCT {source: p, target: level1, rel: r1}) + 
          collect(DISTINCT {source: level1, target: level2, rel: r2}) as allRelationships
        
        // Filter out nulls (from OPTIONAL MATCH)
        WITH 
          [node IN allNodes WHERE node IS NOT NULL] as filteredNodes,
          [rel IN allRelationships WHERE rel.source IS NOT NULL AND rel.target IS NOT NULL AND rel.rel IS NOT NULL] as filteredRelationships
        
        // Format nodes
        WITH
          [node IN filteredNodes | {
            id: CASE 
                 WHEN node:Person THEN 'person-' + node.visitorId
                 ELSE labels(node)[0] + '-' + COALESCE(node.name, '') + '-' + id(node)
               END,
            name: CASE 
                   WHEN node:Person THEN 'You'
                   WHEN node:Concept THEN node.name
                   WHEN node:Goal THEN node.name
                   WHEN node:Challenge THEN node.name
                   WHEN node:Value THEN node.name
                   WHEN node:Emotion THEN node.name
                   WHEN node:Habit THEN node.name
                   WHEN node:Achievement THEN node.name
                   ELSE labels(node)[0] + ' ' + id(node)
                 END,
            group: labels(node)[0],
            description: CASE
                          WHEN node:Concept THEN node.description
                          WHEN node:Goal THEN node.description
                          WHEN node:Challenge THEN node.description
                          WHEN node:Value THEN node.description
                          ELSE null
                        END
          }] as nodes,
          
          // Format relationships
          [rel IN filteredRelationships | {
            source: CASE 
                     WHEN rel.source:Person THEN 'person-' + rel.source.visitorId
                     ELSE labels(rel.source)[0] + '-' + COALESCE(rel.source.name, '') + '-' + id(rel.source)
                   END,
            target: CASE 
                     WHEN rel.target:Person THEN 'person-' + rel.target.visitorId
                     ELSE labels(rel.target)[0] + '-' + COALESCE(rel.target.name, '') + '-' + id(rel.target)
                   END,
            value: 1,
            type: type(rel.rel)
          }] as links
          
        RETURN {nodes: nodes, links: links} as graphData
      `, { visitorId });
      
      if (result.records.length > 0) {
        graphData = result.records[0].get('graphData');
        console.log(`Retrieved graph with ${graphData.nodes.length} nodes and ${graphData.links.length} links`);
      } else {
        // If no data found, return empty graph with just the person
        graphData = {
          nodes: [{
            id: `person-${visitorId}`,
            name: 'You',
            group: 'Person',
            description: null
          }],
          links: []
        };
        console.log('No graph data found for this visitor, returning empty graph');
      }
    } catch (neo4jError) {
      console.error('Neo4j error:', neo4jError);
      throw new Error(`Neo4j error: ${neo4jError.message}`);
    } finally {
      if (session) {
        await session.close();
      }
      if (driver) {
        await driver.close();
      }
    }
    
    return new Response(
      JSON.stringify(graphData),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
  } catch (error) {
    console.error('Error fetching knowledge graph:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    );
  }
});
