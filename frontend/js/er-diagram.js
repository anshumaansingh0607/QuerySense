/**
 * QuerySense — Interactive ER Diagram
 * Canvas-based entity-relationship diagram with drag-and-drop, 
 * zoom/pan, and animated FK relationship lines.
 */

const ERDiagram = {
    canvas: null,
    ctx: null,
    nodes: [],
    edges: [],
    dragging: null,
    dragOffset: { x: 0, y: 0 },
    pan: { x: 0, y: 0 },
    isPanning: false,
    lastMouse: { x: 0, y: 0 },
    scale: 1,
    animFrame: null,
    hoverNode: null,
    hoverEdge: null,

    // Color palette
    colors: {
        bg: '#0a0e1a',
        nodeBg: '#141825',
        nodeBorder: '#2a2f42',
        nodeHover: '#1e2436',
        headerBg: '#1a1f33',
        text: '#e2e8f0',
        textDim: '#8892a8',
        pk: '#818cf8',
        fk: '#f59e0b',
        edgeLine: '#4f46e5',
        edgeArrow: '#818cf8',
        gridLine: 'rgba(99, 102, 241, 0.04)',
        shadow: 'rgba(0,0,0,0.5)',
    },

    init(canvasId) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) return;

        this.ctx = this.canvas.getContext('2d');
        this._setupCanvas();
        this._bindEvents();
    },

    _setupCanvas() {
        const container = this.canvas.parentElement;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;

        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.canvas.style.width = rect.width + 'px';
        this.canvas.style.height = rect.height + 'px';
        this.ctx.scale(dpr, dpr);

        this.width = rect.width;
        this.height = rect.height;
    },

    _bindEvents() {
        this.canvas.addEventListener('mousedown', (e) => this._onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this.canvas.addEventListener('mouseup', () => this._onMouseUp());
        this.canvas.addEventListener('mouseleave', () => this._onMouseUp());
        this.canvas.addEventListener('wheel', (e) => this._onWheel(e));
        // Double-click to reset view
        this.canvas.addEventListener('dblclick', () => this._resetView());
    },

    loadSchema(tables) {
        this.nodes = [];
        this.edges = [];

        if (!tables || tables.length === 0) return;

        // Layout nodes in a grid pattern
        const cols = Math.ceil(Math.sqrt(tables.length));
        const nodeW = 220;
        const nodeSpacingX = 280;
        const nodeSpacingY = 260;
        const startX = 40;
        const startY = 40;

        tables.forEach((table, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const rowHeight = 28;
            const headerHeight = 38;
            const nodeH = headerHeight + table.columns.length * rowHeight + 12;

            this.nodes.push({
                id: table.name,
                x: startX + col * nodeSpacingX,
                y: startY + row * nodeSpacingY,
                w: nodeW,
                h: nodeH,
                table: table,
                headerHeight: headerHeight,
                rowHeight: rowHeight,
            });
        });

        // Build FK edges
        this.nodes.forEach(node => {
            node.table.columns.forEach(col => {
                if (col.foreign_key) {
                    const refTable = col.foreign_key.split('.')[0];
                    const targetNode = this.nodes.find(n => n.id === refTable);
                    if (targetNode) {
                        this.edges.push({
                            from: node.id,
                            fromCol: col.name,
                            to: targetNode.id,
                            toCol: col.foreign_key.split('.')[1] || 'id',
                            label: `${col.name} → ${col.foreign_key}`,
                        });
                    }
                }
            });
        });

        // Center view
        this._centerView();
        this._render();
    },

    _centerView() {
        if (this.nodes.length === 0) return;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        this.nodes.forEach(n => {
            minX = Math.min(minX, n.x);
            minY = Math.min(minY, n.y);
            maxX = Math.max(maxX, n.x + n.w);
            maxY = Math.max(maxY, n.y + n.h);
        });
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;
        this.pan.x = this.width / 2 - centerX;
        this.pan.y = this.height / 2 - centerY;
        
        // Fit to view
        const contentW = maxX - minX + 80;
        const contentH = maxY - minY + 80;
        this.scale = Math.min(1.2, this.width / contentW, this.height / contentH);
    },

    _resetView() {
        this._centerView();
        this._render();
    },

    // ── Rendering ──

    _render() {
        if (this.animFrame) cancelAnimationFrame(this.animFrame);
        this.animFrame = requestAnimationFrame(() => this._draw());
    },

    _draw() {
        const ctx = this.ctx;
        ctx.save();
        ctx.clearRect(0, 0, this.width, this.height);

        // Background
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(0, 0, this.width, this.height);

        // Grid
        this._drawGrid(ctx);

        // Apply transform
        ctx.translate(this.pan.x, this.pan.y);
        ctx.scale(this.scale, this.scale);

        // Draw edges first (behind nodes)
        this.edges.forEach(edge => this._drawEdge(ctx, edge));

        // Draw nodes
        this.nodes.forEach(node => this._drawNode(ctx, node));

        ctx.restore();
    },

    _drawGrid(ctx) {
        const gridSize = 30;
        ctx.strokeStyle = this.colors.gridLine;
        ctx.lineWidth = 1;
        for (let x = 0; x < this.width; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, this.height);
            ctx.stroke();
        }
        for (let y = 0; y < this.height; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(this.width, y);
            ctx.stroke();
        }
    },

    _drawNode(ctx, node) {
        const isHover = this.hoverNode === node.id;
        const x = node.x;
        const y = node.y;
        const w = node.w;
        const h = node.h;
        const r = 8;

        // Shadow
        ctx.shadowColor = this.colors.shadow;
        ctx.shadowBlur = isHover ? 20 : 10;
        ctx.shadowOffsetY = 4;

        // Node body
        ctx.fillStyle = isHover ? this.colors.nodeHover : this.colors.nodeBg;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, r);
        ctx.fill();

        // Border
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;
        ctx.strokeStyle = isHover ? this.colors.pk : this.colors.nodeBorder;
        ctx.lineWidth = isHover ? 2 : 1;
        ctx.stroke();

        // Header background
        ctx.fillStyle = this.colors.headerBg;
        ctx.beginPath();
        ctx.roundRect(x, y, w, node.headerHeight, [r, r, 0, 0]);
        ctx.fill();

        // Header divider
        ctx.strokeStyle = this.colors.nodeBorder;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, y + node.headerHeight);
        ctx.lineTo(x + w, y + node.headerHeight);
        ctx.stroke();

        // Table name
        ctx.fillStyle = this.colors.text;
        ctx.font = 'bold 13px "Inter", system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText('📋 ' + node.id, x + 12, y + 24);

        // Row count badge
        if (node.table.row_count != null) {
            const badge = `${node.table.row_count}`;
            ctx.font = '10px "Inter", system-ui, sans-serif';
            const bw = ctx.measureText(badge).width + 12;
            ctx.fillStyle = 'rgba(99, 102, 241, 0.15)';
            ctx.beginPath();
            ctx.roundRect(x + w - bw - 10, y + 12, bw, 18, 9);
            ctx.fill();
            ctx.fillStyle = this.colors.pk;
            ctx.textAlign = 'center';
            ctx.fillText(badge, x + w - bw/2 - 10, y + 24);
        }

        // Columns
        ctx.textAlign = 'left';
        node.table.columns.forEach((col, i) => {
            const cy = y + node.headerHeight + i * node.rowHeight + 20;

            // Column name
            ctx.font = '12px "JetBrains Mono", "Fira Code", monospace';
            ctx.fillStyle = this.colors.text;

            let prefix = '  ';
            if (col.primary_key) {
                prefix = '🔑';
                ctx.fillStyle = this.colors.pk;
            } else if (col.foreign_key) {
                prefix = '🔗';
                ctx.fillStyle = this.colors.fk;
            }

            ctx.fillText(prefix + ' ' + col.name, x + 10, cy);

            // Column type
            ctx.fillStyle = this.colors.textDim;
            ctx.font = '10px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(col.type, x + w - 10, cy);
            ctx.textAlign = 'left';
        });
    },

    _drawEdge(ctx, edge) {
        const fromNode = this.nodes.find(n => n.id === edge.from);
        const toNode = this.nodes.find(n => n.id === edge.to);
        if (!fromNode || !toNode) return;

        // Calculate connection points (center of node sides)
        const from = this._getConnectionPoint(fromNode, toNode);
        const to = this._getConnectionPoint(toNode, fromNode);

        // Curved line
        ctx.strokeStyle = this.colors.edgeLine;
        ctx.lineWidth = 2;
        ctx.setLineDash([]);

        const midX = (from.x + to.x) / 2;
        const midY = (from.y + to.y) / 2;

        // Control point offset for curve
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const cpOffset = Math.min(60, Math.abs(dx) * 0.3, Math.abs(dy) * 0.3);

        ctx.beginPath();
        ctx.moveTo(from.x, from.y);

        if (Math.abs(dx) > Math.abs(dy)) {
            // Horizontal connection — curve vertically
            ctx.bezierCurveTo(
                midX, from.y,
                midX, to.y,
                to.x, to.y
            );
        } else {
            // Vertical connection — curve horizontally
            ctx.bezierCurveTo(
                from.x, midY,
                to.x, midY,
                to.x, to.y
            );
        }
        ctx.stroke();

        // Arrow at end
        this._drawArrow(ctx, midX, midY, to.x, to.y);

        // Label at midpoint
        ctx.fillStyle = this.colors.textDim;
        ctx.font = '9px "Inter", system-ui, sans-serif';
        ctx.textAlign = 'center';
        
        // Background for label
        const labelText = edge.label;
        const lw = ctx.measureText(labelText).width + 8;
        ctx.fillStyle = this.colors.bg;
        ctx.fillRect(midX - lw/2, midY - 14, lw, 16);
        
        ctx.fillStyle = this.colors.edgeArrow;
        ctx.fillText(labelText, midX, midY - 3);
    },

    _drawArrow(ctx, fromX, fromY, toX, toY) {
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const size = 8;

        ctx.fillStyle = this.colors.edgeArrow;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(
            toX - size * Math.cos(angle - Math.PI / 6),
            toY - size * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
            toX - size * Math.cos(angle + Math.PI / 6),
            toY - size * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
    },

    _getConnectionPoint(fromNode, toNode) {
        const fx = fromNode.x + fromNode.w / 2;
        const fy = fromNode.y + fromNode.h / 2;
        const tx = toNode.x + toNode.w / 2;
        const ty = toNode.y + toNode.h / 2;

        const dx = tx - fx;
        const dy = ty - fy;

        // Determine which side to connect from
        if (Math.abs(dx) > Math.abs(dy)) {
            // Connect from left or right
            if (dx > 0) {
                return { x: fromNode.x + fromNode.w, y: fy };
            } else {
                return { x: fromNode.x, y: fy };
            }
        } else {
            // Connect from top or bottom
            if (dy > 0) {
                return { x: fx, y: fromNode.y + fromNode.h };
            } else {
                return { x: fx, y: fromNode.y };
            }
        }
    },

    // ── Mouse Events ──

    _getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left - this.pan.x) / this.scale,
            y: (e.clientY - rect.top - this.pan.y) / this.scale,
        };
    },

    _hitTest(mx, my) {
        for (let i = this.nodes.length - 1; i >= 0; i--) {
            const n = this.nodes[i];
            if (mx >= n.x && mx <= n.x + n.w && my >= n.y && my <= n.y + n.h) {
                return n;
            }
        }
        return null;
    },

    _onMouseDown(e) {
        const pos = this._getMousePos(e);
        const hit = this._hitTest(pos.x, pos.y);

        if (hit) {
            this.dragging = hit;
            this.dragOffset.x = pos.x - hit.x;
            this.dragOffset.y = pos.y - hit.y;
            this.canvas.style.cursor = 'grabbing';
        } else {
            // Pan mode
            this.isPanning = true;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this.canvas.style.cursor = 'grabbing';
        }
    },

    _onMouseMove(e) {
        if (this.dragging) {
            const pos = this._getMousePos(e);
            this.dragging.x = pos.x - this.dragOffset.x;
            this.dragging.y = pos.y - this.dragOffset.y;
            this._render();
        } else if (this.isPanning) {
            const dx = e.clientX - this.lastMouse.x;
            const dy = e.clientY - this.lastMouse.y;
            this.pan.x += dx;
            this.pan.y += dy;
            this.lastMouse = { x: e.clientX, y: e.clientY };
            this._render();
        } else {
            // Hover detection
            const pos = this._getMousePos(e);
            const hit = this._hitTest(pos.x, pos.y);
            const newHover = hit ? hit.id : null;
            if (newHover !== this.hoverNode) {
                this.hoverNode = newHover;
                this.canvas.style.cursor = hit ? 'grab' : 'default';
                this._render();
            }
        }
    },

    _onMouseUp() {
        this.dragging = null;
        this.isPanning = false;
        this.canvas.style.cursor = this.hoverNode ? 'grab' : 'default';
    },

    _onWheel(e) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newScale = Math.max(0.3, Math.min(3, this.scale * delta));

        // Zoom toward mouse position
        const rect = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        this.pan.x = mx - (mx - this.pan.x) * (newScale / this.scale);
        this.pan.y = my - (my - this.pan.y) * (newScale / this.scale);
        this.scale = newScale;

        this._render();
    },
};
