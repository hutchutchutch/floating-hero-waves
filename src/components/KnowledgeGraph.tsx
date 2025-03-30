
import React, { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import * as d3 from 'd3';
import { supabase } from '@/integrations/supabase/client';
import visitorSessionManager from '@/utils/VisitorSessionManager';

// Define the graph data structure
interface GraphNode {
  id: string;
  name: string;
  group: string;
  description?: string;
}

interface GraphLink {
  source: string;
  target: string;
  value: number;
  type?: string;
}

interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

const fetchKnowledgeGraphData = async (): Promise<GraphData> => {
  const visitorId = visitorSessionManager.getVisitorId();
  
  const { data, error } = await supabase.functions.invoke('fetch-knowledge-graph', {
    body: { visitorId }
  });

  if (error) {
    console.error('Error fetching knowledge graph data:', error);
    throw new Error('Failed to fetch graph data');
  }

  return data;
};

const KnowledgeGraph: React.FC = () => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  const { data, isLoading, error } = useQuery({
    queryKey: ['knowledgeGraph'],
    queryFn: fetchKnowledgeGraphData
  });

  useEffect(() => {
    const updateDimensions = () => {
      if (svgRef.current?.parentElement) {
        setDimensions({
          width: svgRef.current.parentElement.clientWidth,
          height: 500 // Fixed height or could be responsive
        });
      }
    };

    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current || dimensions.width === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous graph

    const { width, height } = dimensions;

    // Color scale for different node types
    const colorScale = d3.scaleOrdinal()
      .domain(["Person", "Concept", "Goal", "Challenge", "Value", "Emotion", "Habit", "Achievement"])
      .range(d3.schemeCategory10);

    // Create the simulation
    const simulation = d3.forceSimulation(data.nodes as d3.SimulationNodeDatum[])
      .force("link", d3.forceLink(data.links)
        .id((d: any) => d.id)
        .distance(100))
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("x", d3.forceX(width / 2).strength(0.1))
      .force("y", d3.forceY(height / 2).strength(0.1));

    // Create the links
    const link = svg.append("g")
      .attr("class", "links")
      .selectAll("line")
      .data(data.links)
      .enter()
      .append("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", (d: any) => Math.sqrt(d.value));

    // Create the nodes
    const node = svg.append("g")
      .attr("class", "nodes")
      .selectAll("circle")
      .data(data.nodes)
      .enter()
      .append("circle")
      .attr("r", 8)
      .attr("fill", (d: any) => colorScale(d.group) as string)
      .call(d3.drag<SVGCircleElement, any>()
        .on("start", dragstarted)
        .on("drag", dragged)
        .on("end", dragended) as any);

    // Add node labels
    const label = svg.append("g")
      .attr("class", "labels")
      .selectAll("text")
      .data(data.nodes)
      .enter()
      .append("text")
      .attr("dx", 12)
      .attr("dy", ".35em")
      .text((d: any) => d.name)
      .style("font-size", "10px")
      .style("fill", "#fff");

    // Tooltip for showing more details
    const tooltip = d3.select(tooltipRef.current);

    node.on("mouseover", function(event, d: any) {
      tooltip.transition()
        .duration(200)
        .style("opacity", .9);
      tooltip.html(`
        <strong>${d.name}</strong><br/>
        <span>${d.group}</span><br/>
        ${d.description ? `<p>${d.description}</p>` : ''}
      `)
        .style("left", (event.pageX + 10) + "px")
        .style("top", (event.pageY - 28) + "px");
    })
    .on("mouseout", function() {
      tooltip.transition()
        .duration(500)
        .style("opacity", 0);
    });

    // Update positions on each tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      node
        .attr("cx", (d: any) => d.x = Math.max(8, Math.min(width - 8, d.x)))
        .attr("cy", (d: any) => d.y = Math.max(8, Math.min(height - 8, d.y)));

      label
        .attr("x", (d: any) => d.x)
        .attr("y", (d: any) => d.y);
    });

    // Drag functions
    function dragstarted(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    }

    function dragged(event: any, d: any) {
      d.fx = event.x;
      d.fy = event.y;
    }

    function dragended(event: any, d: any) {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    }

    return () => {
      simulation.stop();
    };
  }, [data, dimensions]);

  if (isLoading) return <div className="p-4 text-center">Loading knowledge graph...</div>;
  if (error) return <div className="p-4 text-center text-red-500">Error loading knowledge graph</div>;
  if (!data || data.nodes.length === 0) {
    return <div className="p-4 text-center">No knowledge graph data available yet. Continue conversations to build your personal knowledge graph.</div>;
  }

  return (
    <div className="p-2">
      <h2 className="text-xl font-semibold mb-4">Your Personal Knowledge Graph</h2>
      <div className="knowledge-graph-container border border-white/10 rounded-lg overflow-hidden">
        <svg ref={svgRef} width={dimensions.width} height={dimensions.height} />
        <div 
          ref={tooltipRef} 
          className="tooltip absolute opacity-0 pointer-events-none bg-black/80 text-white p-2 rounded text-sm max-w-xs"
          style={{ 
            transition: 'opacity 0.2s',
            zIndex: 1000
          }} 
        />
      </div>
      <div className="mt-4 text-sm text-muted-foreground">
        <p>This graph visualizes concepts from your conversations. Drag nodes to explore connections.</p>
      </div>
    </div>
  );
};

export default KnowledgeGraph;
