import React from 'react';

const PageHeader = ({ title, description, icon: Icon, collapseOnMobile = false }) => {
  return (
    <div
      className={`flex items-start md:items-center gap-4 ${collapseOnMobile ? 'lg:mb-6 lg:pb-4 lg:border-b lg:border-text/5 mb-0 pb-0 border-0' : 'mb-6 pb-4 border-b border-text/5'}`}
    >
      {Icon && (
        <div
          className={`bg-accent/10 text-accent rounded-lg shrink-0 ${collapseOnMobile ? 'p-1.5 lg:p-2.5 mt-0.5 lg:mt-0' : 'p-2.5 mt-1 md:mt-0'}`}
        >
          <Icon className={collapseOnMobile ? 'w-4 h-4 lg:w-5 lg:h-5' : 'w-5 h-5'} />
        </div>
      )}
      <div>
        <h1
          className={`font-semibold text-text/90 tracking-tight ${collapseOnMobile ? 'text-base lg:text-xl' : 'text-xl'}`}
        >
          {title}
        </h1>
        {description && (
          <p
            className={`text-sm text-text/50 mt-1 max-w-3xl leading-relaxed ${collapseOnMobile ? 'hidden lg:block' : ''}`}
          >
            {description}
          </p>
        )}
      </div>
    </div>
  );
};

export default PageHeader;
