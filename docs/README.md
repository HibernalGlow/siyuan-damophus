# Damophus Documentation

- [Domain language](../CONTEXT.md)
- [Product scope](product-scope.md)
- [Question-bank contract](question-bank-contract.md)
- [Flashcard contract](flashcard-contract.md)
- [Flashcard capability matrix](flashcard-capability-matrix.md)
- [Architecture](architecture.md)
- [Implementation plan](implementation-plan.md)
- [UI theming plan](ui-theming-plan.md)
- [Reference sources](reference-sources.md)
- [User guide](user-guide.md)
- [Exam mode](exam-mode.md)
- [Migration guide](migration.md)
- [Flashcard migration](flashcard-migration.md)
- [Kramdown export](kramdown-export.md)
- [Agent bridge](agent-bridge.md)
- [Skill management](skill-management.md)
- [Architecture decisions](adr/)

Current editor projection decisions include [ADR 0009: reusable virtual topic
relation bar](adr/0009-virtual-topic-relation-bar.md).

Flashcard ownership, native review rendering and Riff compatibility are defined
by [ADR 0012](adr/0012-damophus-flashcard-protocol.md).

实现与评审时先检查产品范围和数据契约；涉及难以逆转的边界时，再查看对应 ADR。文档之间发生冲突时，以较新的 accepted 决策为准，并在同一提交中修正其他文档。
