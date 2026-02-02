import { useEffect, useRef, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { useTargetStore } from '../../store/targetStore'
import { useSessionStore } from '../../store/sessionStore'
import { Service } from '../../types'
import {
  RefreshCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Filter,
  X,
  Monitor,
  Server,
  Globe,
  Wifi,
  Shield,
} from 'lucide-react'

interface NetworkNode extends d3.SimulationNodeDatum {
  id: string
  type: 'attacker' | 'target' | 'gateway'
  label: string
  status?: string
  os?: string
  services?: Service[]
  sessionCount?: number
  group?: string
  ip?: string
}

interface NetworkLink extends d3.SimulationLinkDatum<NetworkNode> {
  source: string | NetworkNode
  target: string | NetworkNode
  type: 'session' | 'route'
  sessionType?: string
  sessionId?: number
}

export default function NetworkVisualization() {
  const svgRef = useRef<SVGSVGElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const { targets, fetchTargets } = useTargetStore()
  const { sessions, fetchSessions } = useSessionStore()

  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState({
    showOnline: true,
    showOffline: true,
    showCompromised: true,
    showUnknown: true,
    groupByOS: false,
    groupByNetwork: false,
  })
  const [zoom, setZoom] = useState(1)

  // Fetch data on mount
  useEffect(() => {
    fetchTargets()
    fetchSessions()
  }, [fetchTargets, fetchSessions])

  // Build graph data from targets and sessions
  const buildGraphData = useCallback((): { nodes: NetworkNode[]; links: NetworkLink[] } => {
    const nodes: NetworkNode[] = []
    const links: NetworkLink[] = []
    const nodeMap = new Map<string, NetworkNode>()

    // Add attacker node (center)
    const attackerNode: NetworkNode = {
      id: 'attacker',
      type: 'attacker',
      label: 'Attacker',
      status: 'active',
    }
    nodes.push(attackerNode)
    nodeMap.set('attacker', attackerNode)

    // Add target nodes
    targets.forEach((target) => {
      // Apply filters
      if (!filters.showOnline && target.status === 'online') return
      if (!filters.showOffline && target.status === 'offline') return
      if (!filters.showCompromised && target.status === 'compromised') return
      if (!filters.showUnknown && target.status === 'unknown') return

      const node: NetworkNode = {
        id: target.id,
        type: 'target',
        label: target.hostname || target.ip,
        status: target.status,
        os: target.os,
        services: target.services,
        sessionCount: target.session_count,
        group: filters.groupByOS ? target.os_family : filters.groupByNetwork ? getNetworkGroup(target.ip) : target.group,
        ip: target.ip,
      }
      nodes.push(node)
      nodeMap.set(target.id, node)
    })

    // Add session links
    sessions.forEach((session) => {
      // Find target by IP
      const targetNode = nodes.find(
        (n) => n.type === 'target' && (n.ip === session.session_host || n.ip === session.target_host)
      )

      if (targetNode) {
        links.push({
          source: 'attacker',
          target: targetNode.id,
          type: 'session',
          sessionType: session.type,
          sessionId: session.id,
        })
      }
    })

    return { nodes, links }
  }, [targets, sessions, filters])

  // Get network group from IP (first 3 octets)
  const getNetworkGroup = (ip: string): string => {
    const parts = ip.split('.')
    return parts.slice(0, 3).join('.') + '.0/24'
  }

  // Render D3 visualization
  useEffect(() => {
    if (!svgRef.current || !containerRef.current) return

    const { nodes, links } = buildGraphData()
    if (nodes.length === 0) return

    const container = containerRef.current
    const width = container.clientWidth
    const height = container.clientHeight

    // Clear previous
    d3.select(svgRef.current).selectAll('*').remove()

    const svg = d3.select(svgRef.current)
      .attr('width', width)
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])

    // Create zoom behavior
    const zoomBehavior = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform)
        setZoom(event.transform.k)
      })

    svg.call(zoomBehavior)

    // Main group for all elements
    const g = svg.append('g')

    // Define arrow markers for links
    svg.append('defs').selectAll('marker')
      .data(['session', 'route'])
      .join('marker')
      .attr('id', d => `arrow-${d}`)
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 25)
      .attr('refY', 0)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('fill', d => d === 'session' ? '#238636' : '#58a6ff')
      .attr('d', 'M0,-5L10,0L0,5')

    // Create force simulation
    const simulation = d3.forceSimulation<NetworkNode>(nodes)
      .force('link', d3.forceLink<NetworkNode, NetworkLink>(links)
        .id(d => d.id)
        .distance(150)
        .strength(0.5))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(50))

    // Group nodes by their group property
    if (filters.groupByOS || filters.groupByNetwork) {
      const groups = new Map<string, NetworkNode[]>()
      nodes.forEach(node => {
        if (node.group) {
          if (!groups.has(node.group)) {
            groups.set(node.group, [])
          }
          groups.get(node.group)!.push(node)
        }
      })

      // Add clustering force
      simulation.force('cluster', d3.forceX<NetworkNode>()
        .x(d => {
          if (d.type === 'attacker') return width / 2
          const groupIndex = Array.from(groups.keys()).indexOf(d.group || '')
          const angle = (groupIndex / groups.size) * 2 * Math.PI
          return width / 2 + Math.cos(angle) * 200
        })
        .strength(0.1))
    }

    // Draw links
    const link = g.append('g')
      .attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', d => d.type === 'session' ? '#238636' : '#58a6ff')
      .attr('stroke-opacity', 0.8)
      .attr('stroke-width', d => d.type === 'session' ? 2 : 1)
      .attr('stroke-dasharray', d => d.type === 'route' ? '5,5' : 'none')
      .attr('marker-end', d => `url(#arrow-${d.type})`)

    // Draw link labels
    const linkLabel = g.append('g')
      .attr('class', 'link-labels')
      .selectAll('text')
      .data(links)
      .join('text')
      .attr('font-size', 10)
      .attr('fill', '#8b949e')
      .attr('text-anchor', 'middle')
      .text(d => d.sessionType || '')

    // Draw nodes
    const node = g.append('g')
      .attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')

    // Add drag behavior
    const dragBehavior = d3.drag<SVGGElement, NetworkNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart()
        d.fx = d.x
        d.fy = d.y
      })
      .on('drag', (event, d) => {
        d.fx = event.x
        d.fy = event.y
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0)
        d.fx = null
        d.fy = null
      })

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    node.call(dragBehavior as any)

    // Node circles
    node.append('circle')
      .attr('r', d => d.type === 'attacker' ? 30 : 20)
      .attr('fill', d => getNodeColor(d))
      .attr('stroke', d => d.type === 'attacker' ? '#f85149' : getNodeStroke(d))
      .attr('stroke-width', 3)

    // Node icons
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', d => d.type === 'attacker' ? 20 : 14)
      .text(d => getNodeIcon(d))

    // Node labels
    node.append('text')
      .attr('y', d => d.type === 'attacker' ? 45 : 35)
      .attr('text-anchor', 'middle')
      .attr('fill', '#e6edf3')
      .attr('font-size', 12)
      .attr('font-weight', 500)
      .text(d => d.label)

    // Session count badge
    node.filter(d => d.type === 'target' && (d.sessionCount || 0) > 0)
      .append('circle')
      .attr('cx', 15)
      .attr('cy', -15)
      .attr('r', 10)
      .attr('fill', '#238636')

    node.filter(d => d.type === 'target' && (d.sessionCount || 0) > 0)
      .append('text')
      .attr('x', 15)
      .attr('y', -15)
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', 10)
      .attr('font-weight', 'bold')
      .text(d => d.sessionCount || '')

    // Click handler
    node.on('click', (event, d) => {
      event.stopPropagation()
      setSelectedNode(d)
    })

    // Hover effects
    node.on('mouseenter', function(_event, d) {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', d.type === 'attacker' ? 35 : 25)
    })

    node.on('mouseleave', function(_event, d) {
      d3.select(this).select('circle')
        .transition()
        .duration(200)
        .attr('r', d.type === 'attacker' ? 30 : 20)
    })

    // Click on background to deselect
    svg.on('click', () => setSelectedNode(null))

    // Update positions on tick
    simulation.on('tick', () => {
      link
        .attr('x1', d => (d.source as NetworkNode).x!)
        .attr('y1', d => (d.source as NetworkNode).y!)
        .attr('x2', d => (d.target as NetworkNode).x!)
        .attr('y2', d => (d.target as NetworkNode).y!)

      linkLabel
        .attr('x', d => ((d.source as NetworkNode).x! + (d.target as NetworkNode).x!) / 2)
        .attr('y', d => ((d.source as NetworkNode).y! + (d.target as NetworkNode).y!) / 2)

      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    // Cleanup
    return () => {
      simulation.stop()
    }
  }, [buildGraphData, filters])

  // Get node color based on type and status
  const getNodeColor = (node: NetworkNode): string => {
    if (node.type === 'attacker') return '#21262d'
    switch (node.status) {
      case 'compromised': return '#238636'
      case 'online': return '#1f6feb'
      case 'offline': return '#484f58'
      default: return '#30363d'
    }
  }

  // Get node stroke color
  const getNodeStroke = (node: NetworkNode): string => {
    switch (node.status) {
      case 'compromised': return '#3fb950'
      case 'online': return '#58a6ff'
      case 'offline': return '#6e7681'
      default: return '#484f58'
    }
  }

  // Get node icon
  const getNodeIcon = (node: NetworkNode): string => {
    if (node.type === 'attacker') return '💀'
    if (node.status === 'compromised') return '🔓'
    if (node.os?.toLowerCase().includes('windows')) return '🪟'
    if (node.os?.toLowerCase().includes('linux')) return '🐧'
    if (node.os?.toLowerCase().includes('mac')) return '🍎'
    return '💻'
  }

  // Zoom controls
  const handleZoomIn = () => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(300).call(
      d3.zoom<SVGSVGElement, unknown>().scaleBy as any,
      1.5
    )
  }

  const handleZoomOut = () => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(300).call(
      d3.zoom<SVGSVGElement, unknown>().scaleBy as any,
      0.67
    )
  }

  const handleFitView = () => {
    if (!svgRef.current || !containerRef.current) return
    const svg = d3.select(svgRef.current)
    const container = containerRef.current
    svg.transition().duration(500).call(
      d3.zoom<SVGSVGElement, unknown>().transform as any,
      d3.zoomIdentity.translate(container.clientWidth / 2, container.clientHeight / 2).scale(1)
    )
  }

  const handleRefresh = () => {
    fetchTargets()
    fetchSessions()
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Network Visualization</h1>
          <p className="text-gray-400 text-sm mt-1">
            Interactive map of targets, sessions, and connections
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-colors ${
              showFilters ? 'bg-msf-accent text-white' : 'bg-msf-card text-gray-400 hover:text-white'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
          <button
            onClick={handleRefresh}
            className="px-3 py-2 bg-msf-card text-gray-400 rounded-lg hover:text-white transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div className="bg-msf-card border border-msf-border rounded-lg p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={filters.showOnline}
                onChange={(e) => setFilters({ ...filters, showOnline: e.target.checked })}
                className="rounded bg-msf-darker border-msf-border text-msf-accent focus:ring-msf-accent"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-blue-500" />
                Online
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={filters.showOffline}
                onChange={(e) => setFilters({ ...filters, showOffline: e.target.checked })}
                className="rounded bg-msf-darker border-msf-border text-msf-accent focus:ring-msf-accent"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-500" />
                Offline
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={filters.showCompromised}
                onChange={(e) => setFilters({ ...filters, showCompromised: e.target.checked })}
                className="rounded bg-msf-darker border-msf-border text-msf-accent focus:ring-msf-accent"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-green-500" />
                Compromised
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input
                type="checkbox"
                checked={filters.showUnknown}
                onChange={(e) => setFilters({ ...filters, showUnknown: e.target.checked })}
                className="rounded bg-msf-darker border-msf-border text-msf-accent focus:ring-msf-accent"
              />
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-gray-600" />
                Unknown
              </span>
            </label>
          </div>
          <div className="border-t border-msf-border mt-4 pt-4">
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-400">Group by:</span>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={filters.groupByOS}
                  onChange={(e) => setFilters({ ...filters, groupByOS: e.target.checked, groupByNetwork: false })}
                  className="rounded bg-msf-darker border-msf-border text-msf-accent focus:ring-msf-accent"
                />
                OS Family
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={filters.groupByNetwork}
                  onChange={(e) => setFilters({ ...filters, groupByNetwork: e.target.checked, groupByOS: false })}
                  className="rounded bg-msf-darker border-msf-border text-msf-accent focus:ring-msf-accent"
                />
                Network Subnet
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Main visualization area */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Graph container */}
        <div
          ref={containerRef}
          className="flex-1 bg-msf-darker border border-msf-border rounded-lg relative overflow-hidden"
        >
          <svg ref={svgRef} className="w-full h-full" />

          {/* Zoom controls */}
          <div className="absolute top-4 left-4 flex flex-col gap-2">
            <button
              onClick={handleZoomIn}
              className="p-2 bg-msf-card border border-msf-border rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2 bg-msf-card border border-msf-border rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleFitView}
              className="p-2 bg-msf-card border border-msf-border rounded-lg text-gray-400 hover:text-white transition-colors"
              title="Fit to View"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom indicator */}
          <div className="absolute bottom-4 left-4 px-3 py-1 bg-msf-card border border-msf-border rounded text-sm text-gray-400">
            {Math.round(zoom * 100)}%
          </div>

          {/* Legend */}
          <div className="absolute bottom-4 right-4 bg-msf-card border border-msf-border rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-2 font-medium">Legend</div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <span className="w-3 h-3 rounded-full bg-green-600 border-2 border-green-400" />
                Compromised
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <span className="w-3 h-3 rounded-full bg-blue-600 border-2 border-blue-400" />
                Online
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <span className="w-3 h-3 rounded-full bg-gray-600 border-2 border-gray-500" />
                Offline/Unknown
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-300 mt-2 pt-2 border-t border-msf-border">
                <span className="w-4 h-0.5 bg-green-500" />
                Active Session
              </div>
            </div>
          </div>

          {/* Empty state */}
          {targets.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Globe className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-400">No targets found</h3>
                <p className="text-gray-500 text-sm mt-1">
                  Add targets to visualize your network
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Details panel */}
        {selectedNode && (
          <div className="w-80 bg-msf-card border border-msf-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-msf-border">
              <h3 className="font-medium text-white">Node Details</h3>
              <button
                onClick={() => setSelectedNode(null)}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              {selectedNode.type === 'attacker' ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-msf-darker border-2 border-red-500 flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">💀</span>
                  </div>
                  <h4 className="text-lg font-medium text-white">Attacker Node</h4>
                  <p className="text-gray-400 text-sm mt-1">This is your position</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center text-2xl ${
                      selectedNode.status === 'compromised' ? 'bg-green-900/30' :
                      selectedNode.status === 'online' ? 'bg-blue-900/30' : 'bg-gray-800'
                    }`}>
                      {getNodeIcon(selectedNode)}
                    </div>
                    <div>
                      <h4 className="font-medium text-white">{selectedNode.label}</h4>
                      <p className="text-sm text-gray-400">{selectedNode.ip}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Status</span>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        selectedNode.status === 'compromised' ? 'bg-green-900/30 text-green-400' :
                        selectedNode.status === 'online' ? 'bg-blue-900/30 text-blue-400' :
                        'bg-gray-800 text-gray-400'
                      }`}>
                        {selectedNode.status}
                      </span>
                    </div>
                    {selectedNode.os && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">OS</span>
                        <span className="text-gray-300">{selectedNode.os}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400">Sessions</span>
                      <span className="text-gray-300">{selectedNode.sessionCount || 0}</span>
                    </div>
                    {selectedNode.group && (
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Group</span>
                        <span className="text-gray-300">{selectedNode.group}</span>
                      </div>
                    )}
                  </div>

                  {selectedNode.services && selectedNode.services.length > 0 && (
                    <div>
                      <h5 className="text-sm font-medium text-gray-300 mb-2">
                        Services ({selectedNode.services.length})
                      </h5>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {selectedNode.services.map((service) => (
                          <div
                            key={service.id}
                            className="flex items-center justify-between px-2 py-1 bg-msf-darker rounded text-xs"
                          >
                            <span className="text-gray-300">
                              {service.port}/{service.protocol}
                            </span>
                            <span className="text-gray-400">{service.service}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Stats bar */}
      <div className="mt-4 grid grid-cols-4 gap-4">
        <div className="bg-msf-card border border-msf-border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Monitor className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-xl font-bold text-white">{targets.length}</div>
              <div className="text-xs text-gray-400">Total Targets</div>
            </div>
          </div>
        </div>
        <div className="bg-msf-card border border-msf-border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-green-400" />
            <div>
              <div className="text-xl font-bold text-white">
                {targets.filter(t => t.status === 'compromised').length}
              </div>
              <div className="text-xs text-gray-400">Compromised</div>
            </div>
          </div>
        </div>
        <div className="bg-msf-card border border-msf-border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Wifi className="w-5 h-5 text-msf-accent" />
            <div>
              <div className="text-xl font-bold text-white">{sessions.length}</div>
              <div className="text-xs text-gray-400">Active Sessions</div>
            </div>
          </div>
        </div>
        <div className="bg-msf-card border border-msf-border rounded-lg p-3">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-purple-400" />
            <div>
              <div className="text-xl font-bold text-white">
                {targets.reduce((sum, t) => sum + (t.services?.length || 0), 0)}
              </div>
              <div className="text-xs text-gray-400">Services</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
