import { Plugin } from '@tiptap/pm/state';
import { Extension } from '@tiptap/core';

function findBlockParent(view, pos) {
  const $pos = view.state.doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d--) {
    const node = $pos.node(d);
    if (node.isBlock && !node.isTextblock || node.isTextblock) {
      return { node, pos: $pos.before(d), depth: d };
    }
  }
  return null;
}

export const DragHandle = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    let dragHandleEl = null;
    let currentBlock = null;

    const createHandle = () => {
      const el = document.createElement('div');
      el.className = 'drag-handle';
      el.draggable = true;
      el.innerHTML = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><circle cx="5" cy="3" r="1.5"/><circle cx="11" cy="3" r="1.5"/><circle cx="5" cy="8" r="1.5"/><circle cx="11" cy="8" r="1.5"/><circle cx="5" cy="13" r="1.5"/><circle cx="11" cy="13" r="1.5"/></svg>';
      el.addEventListener('dragstart', (e) => {
        if (!currentBlock) return;
        const { view } = this.editor;
        const blockPos = currentBlock.pos;
        const nodeAtPos = view.state.doc.nodeAt(blockPos);
        if (!nodeAtPos) return;

        view.dispatch(view.state.tr.setSelection(
          view.state.selection.constructor.near(view.state.doc.resolve(blockPos))
        ));

        const slice = view.state.selection.content();
        const { dom, text } = view.serializeForClipboard(slice);
        e.dataTransfer.clearData();
        e.dataTransfer.setData('text/html', dom.innerHTML);
        e.dataTransfer.setData('text/plain', text);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setDragImage(el, 0, 0);

        view.dragging = { slice, move: true };
      });
      return el;
    };

    return [
      new Plugin({
        view: (editorView) => {
          dragHandleEl = createHandle();
          editorView.dom.parentElement?.appendChild(dragHandleEl);

          return {
            destroy: () => {
              dragHandleEl?.remove();
              dragHandleEl = null;
            },
          };
        },
        props: {
          handleDOMEvents: {
            mousemove: (view, event) => {
              if (!dragHandleEl) return false;
              const editorRect = view.dom.getBoundingClientRect();
              const pos = view.posAtCoords({ left: editorRect.left + 10, top: event.clientY });
              if (!pos) {
                dragHandleEl.style.opacity = '0';
                return false;
              }

              const block = findBlockParent(view, pos.pos);
              if (!block) {
                dragHandleEl.style.opacity = '0';
                return false;
              }

              currentBlock = block;
              const blockDom = view.nodeDOM(block.pos);
              if (!blockDom || !(blockDom instanceof HTMLElement)) {
                dragHandleEl.style.opacity = '0';
                return false;
              }

              const blockRect = blockDom.getBoundingClientRect();
              const parentRect = view.dom.parentElement.getBoundingClientRect();

              dragHandleEl.style.top = `${blockRect.top - parentRect.top + 2}px`;
              dragHandleEl.style.left = `-22px`;
              dragHandleEl.style.opacity = '1';

              return false;
            },
            mouseleave: () => {
              if (dragHandleEl) dragHandleEl.style.opacity = '0';
              return false;
            },
          },
        },
      }),
    ];
  },
});
