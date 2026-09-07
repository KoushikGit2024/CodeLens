import React from 'react';

const PageHeader = ({ title, description, icon: Icon }) => {
  return (
    <div className="flex items-start md:items-center gap-4 mb-6 pb-4 border-b border-white/5">
      {Icon && (
        <div className="p-2.5 bg-accent/10 text-accent rounded-lg shrink-0 mt-1 md:mt-0">
          <Icon className="w-5 h-5" />
        </div>
      )}
      <div>
        <h1 className="text-xl font-semibold text-white/90 tracking-tight">{title}</h1>
        {description && (
          <p className="text-sm text-white/50 mt-1 max-w-3xl leading-relaxed">{description}</p>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
